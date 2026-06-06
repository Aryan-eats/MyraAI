import { NextRequest, NextResponse } from "next/server"
import connectDb from "@/lib/db"
import {
  applyCorsHeaders,
  buildRateLimitKey,
  createChatRateLimiter,
  getChatAllowedOrigins,
  resolveAllowedOrigin,
} from "@/lib/apiSecurity"
import {
  getCachedResponse,
  setCachedResponse,
} from "@/lib/chatCache"
import { generateText, generateWithTools } from "@/lib/gemini"
import { hasConfiguredLlmProvider } from "@/lib/llm/router"
import { getChatUser } from "@/lib/chatAuth"
import { escalateConversation } from "@/lib/escalation"
import {
  GEMINI_TOOL_DECLARATIONS,
  INTENT_CLASSIFIER_PROMPT,
  isToolName,
  toIntentSlug,
  ttlForIntent,
} from "@/lib/geminiTools"
import {
  getCommissionStatus,
  getDocumentChecklist,
  getEmiSchedule,
  getLeadPipeline,
  getLoanStatus,
  GpsBridgeError,
} from "@/lib/gpsBridge"
import {
  classifyByRules,
  ChatIntent,
  IntentClassification,
  ToolName,
} from "@/lib/intentRules"
import KnowledgeDocument from "@/model/knowledge.model"
import Settings from "@/model/settings.model"

const chatRateLimiter = createChatRateLimiter()
const allowedOrigins = getChatAllowedOrigins()

type ChatBody = {
  message: string
  ownerId?: string
  conversation?: Array<{ role: "user" | "assistant"; text: string }>
}

function jsonResponse(payload: Record<string, unknown>, status = 200, allowedOrigin: string | null = null) {
  const response = NextResponse.json(payload, { status })
  return applyCorsHeaders(response, allowedOrigin)
}

function validateOrigin(req: NextRequest) {
  return resolveAllowedOrigin(req.headers.get("origin"), allowedOrigins)
}

function normalizeFreeformSlug(message: string) {
  return message.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "general-faq"
}

function mapRuleToInitialSlug(ruleResult: IntentClassification | null, message: string) {
  if (ruleResult) {
    return toIntentSlug(ruleResult.intent, ruleResult.params)
  }
  return `faq-${normalizeFreeformSlug(message)}`
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    const start = raw.indexOf("{")
    const end = raw.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
      } catch {
        return null
      }
    }
    return null
  }
}

function sanitizeClassification(raw: Record<string, unknown> | null): IntentClassification {
  const validIntents: ChatIntent[] = [
    "commission_status",
    "loan_status",
    "document_checklist",
    "emi_schedule",
    "lead_pipeline",
    "general_faq",
    "out_of_scope",
  ]

  const intent = validIntents.includes(raw?.intent as ChatIntent)
    ? (raw?.intent as ChatIntent)
    : "out_of_scope"

  const toolName =
    typeof raw?.toolName === "string" && isToolName(raw.toolName) ? (raw.toolName as ToolName) : null
  const confidence = typeof raw?.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0
  const params = typeof raw?.params === "object" && raw.params !== null ? (raw.params as Record<string, string>) : {}

  return { intent, toolName, confidence, params }
}

async function classifyIntentWithModel(message: string): Promise<IntentClassification> {
  const rawText = await generateText({
    systemInstruction: INTENT_CLASSIFIER_PROMPT,
    message,
    temperature: 0,
    jsonMode: true,
  })
  const parsed = parseJsonObject(rawText)
  return sanitizeClassification(parsed)
}

async function fetchAudienceKnowledge(role: string, ownerId?: string) {
  await connectDb()
  const docs = await KnowledgeDocument.find({
    active: true,
    audiences: { $in: [role, "all"] },
  })
    .sort({ updatedAt: -1 })
    .limit(8)
    .lean()

  if (docs.length) {
    return docs.map((doc) => `${doc.title}\n${doc.content}`).join("\n\n---\n\n")
  }

  if (ownerId) {
    const setting = await Settings.findOne({ ownerId }).lean()
    if (setting?.knowledge) {
      return String(setting.knowledge)
    }
  }

  return "No knowledge base entries available."
}

async function generateFaqResponse(message: string, knowledge: string) {
  const prompt = `
You are Myra AI for GPS India Financial Services.
Answer only from the provided knowledge base context.
If unsure, explicitly state that and ask user to connect to support.

Knowledge:
${knowledge}

User message:
${message}
`

  return (
    await generateText({
      message: prompt,
      temperature: 0.2,
    })
  ) || "I could not find that in the knowledge base."
}

async function invokeGpsTool(
  toolName: ToolName,
  args: Record<string, unknown>,
  userToken: string,
): Promise<unknown> {
  if (toolName === "get_commission_status") {
    return getCommissionStatus(
      { partnerId: String(args.partnerId), period: args.period ? String(args.period) : undefined },
      { token: userToken },
    )
  }
  if (toolName === "get_loan_status") {
    return getLoanStatus({ applicationId: String(args.applicationId) }, { token: userToken })
  }
  if (toolName === "get_document_checklist") {
    return getDocumentChecklist({ applicationId: String(args.applicationId) }, { token: userToken })
  }
  if (toolName === "get_emi_schedule") {
    return getEmiSchedule({ loanId: String(args.loanId) }, { token: userToken })
  }
  return getLeadPipeline(
    { partnerId: String(args.partnerId), status: args.status ? String(args.status) : undefined },
    { token: userToken },
  )
}

async function runToolFlow(
  message: string,
  preferredTool: ToolName,
  classifierParams: Record<string, string>,
  userToken: string,
) {
  const planningResult = await generateWithTools({
    systemInstruction:
      "You are Myra AI. Select the best function call for the user message. Prefer the hinted tool and include all known params.",
    tools: [{ functionDeclarations: GEMINI_TOOL_DECLARATIONS }],
    temperature: 0,
    messages: [
      {
        role: "user",
        content: `Tool hint: ${preferredTool}\nKnown parameters: ${JSON.stringify(classifierParams)}\nUser message: ${message}`,
      },
    ],
  })

  const candidate = (planningResult as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> }).candidates?.[0]
  const parts = candidate?.content?.parts ?? []
  const functionCallPart = parts.find((part) => "functionCall" in part) as
    | { functionCall?: { name?: string; args?: Record<string, unknown> } }
    | undefined

  if (!functionCallPart?.functionCall?.name || !isToolName(functionCallPart.functionCall.name)) {
    throw new Error("Model did not return a valid function call.")
  }

  const toolName = functionCallPart.functionCall.name as ToolName
  const args = functionCallPart.functionCall.args ?? {}
  const toolResult = await invokeGpsTool(toolName, args, userToken)

  const answerResult = await generateWithTools({
    systemInstruction:
      "You are Myra AI. Respond in clear business language with key fields, summary, and next steps.",
    tools: [{ functionDeclarations: GEMINI_TOOL_DECLARATIONS }],
    temperature: 0.15,
    messages: [
      { role: "user", content: message },
      { role: "model", content: { parts: [{ functionCall: { name: toolName, args } }] } },
      { role: "user", content: { parts: [{ functionResponse: { name: toolName, response: { result: toolResult } } }] } },
    ],
  })

  return {
    answer: answerResult.text || "I have fetched the latest details.",
    toolName,
    toolResult,
  }
}

export async function POST(req: NextRequest) {
  try {
    const allowedOrigin = validateOrigin(req)
    if (allowedOrigin === false) {
      return jsonResponse({ message: "Origin is not allowed for /api/chat." }, 403)
    }

    if (!hasConfiguredLlmProvider()) {
      return jsonResponse(
        { message: "Missing LLM key. Set GEMINI_API_KEY, OPENAI_API_KEY, or CLAUDE_API_KEY." },
        500,
        allowedOrigin,
      )
    }

    const body = (await req.json()) as ChatBody
    if (!body.message) {
      return jsonResponse({ message: "message is required" }, 400, allowedOrigin)
    }

    const chatUser = await getChatUser(req)
    const rateLimit = chatRateLimiter.consume(buildRateLimitKey(req, chatUser.userId))
    if (!rateLimit.allowed) {
      const response = jsonResponse({ message: "Rate limit exceeded for /api/chat." }, 429, allowedOrigin)
      response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds))
      return response
    }

    // Tier 0: Redis cache check
    const ruleProbe = classifyByRules(body.message)
    const tier0Slug = mapRuleToInitialSlug(ruleProbe, body.message)
    const cached = await getCachedResponse(chatUser.userId, tier0Slug)
    if (cached) {
      return jsonResponse({
        answer: cached.answer,
        intent: cached.intent,
        toolName: cached.toolName,
        source: "cache",
      }, 200, allowedOrigin)
    }

    // Tier 1: Rules classifier
    let classification: IntentClassification
    if (ruleProbe && ruleProbe.confidence >= 0.9) {
      classification = ruleProbe
    } else {
      // Tier 2: Model-based intent classifier (Gemini primary, OpenAI fallback)
      classification = await classifyIntentWithModel(body.message)
    }

    const intentSlug = toIntentSlug(classification.intent, classification.params)

    if (
      classification.intent === "out_of_scope" ||
      classification.confidence < 0.6
    ) {
      const answer = await escalateConversation({
        chatUser,
        message: body.message,
        intent: classification.intent,
        confidence: classification.confidence,
        reason: classification.intent === "out_of_scope" ? "out_of_scope_intent" : "low_confidence",
        conversation: body.conversation,
      })

      return jsonResponse({
        answer,
        intent: classification.intent,
        escalated: true,
      }, 200, allowedOrigin)
    }

    if (chatUser.userRole === "anonymous" && classification.intent !== "general_faq") {
      return jsonResponse({
        answer:
          "Please sign in to your GPS India account to access loan, commission, EMI, or lead-specific details.",
        intent: classification.intent,
        toolName: classification.toolName,
        blocked: true,
      }, 200, allowedOrigin)
    }

    // Tier 3: response generation
    if (classification.intent === "general_faq") {
      const knowledge = await fetchAudienceKnowledge(chatUser.userRole, body.ownerId)
      const answer = await generateFaqResponse(body.message, knowledge)
      await setCachedResponse(
        chatUser.userId,
        intentSlug,
        { answer, intent: classification.intent, toolName: null },
        ttlForIntent(classification.intent),
      )

      return jsonResponse({
        answer,
        intent: classification.intent,
        toolName: null,
        source: "model_faq",
      }, 200, allowedOrigin)
    }

    if (!classification.toolName) {
      const answer = await escalateConversation({
        chatUser,
        message: body.message,
        intent: classification.intent,
        confidence: classification.confidence,
        reason: "missing_tool_mapping",
        conversation: body.conversation,
      })
      return jsonResponse({ answer, intent: classification.intent, escalated: true }, 200, allowedOrigin)
    }

    if (!chatUser.token) {
      return jsonResponse(
        {
          answer: "Please sign in to continue with account-specific requests.",
          intent: classification.intent,
          toolName: classification.toolName,
          blocked: true,
        },
        401,
        allowedOrigin,
      )
    }

    const toolFlow = await runToolFlow(
      body.message,
      classification.toolName,
      classification.params,
      chatUser.token,
    )

    await setCachedResponse(
      chatUser.userId,
      intentSlug,
      {
        answer: toolFlow.answer,
        intent: classification.intent,
        toolName: toolFlow.toolName,
        metadata: { toolResult: toolFlow.toolResult as Record<string, unknown> },
      },
      ttlForIntent(classification.intent),
    )

    return jsonResponse({
      answer: toolFlow.answer,
      intent: classification.intent,
      toolName: toolFlow.toolName,
      source: "model_tool",
    }, 200, allowedOrigin)
  } catch (error) {
    if (error instanceof GpsBridgeError) {
      return jsonResponse({ message: error.message, code: error.code }, error.status ?? 500)
    }

    return jsonResponse({ message: `chat error: ${String(error)}` }, 500)
  }
}

export const OPTIONS = async (req: NextRequest) => {
  const allowedOrigin = validateOrigin(req)
  if (allowedOrigin === false) {
    return jsonResponse({ message: "Origin is not allowed for /api/chat." }, 403)
  }

  return applyCorsHeaders(NextResponse.json(null, { status: 201 }), allowedOrigin)
}
