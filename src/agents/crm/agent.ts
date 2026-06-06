import { getCrmSystemPrompt } from "@/agents/crm/persona"
import { addPartnerNote } from "@/agents/crm/tools/addPartnerNote"
import { analyseDocument } from "@/agents/crm/tools/analyseDocument"
import { generateBriefing } from "@/agents/crm/tools/generateBriefing"
import { getCommissions } from "@/agents/crm/tools/getCommissions"
import { queryPipeline } from "@/agents/crm/tools/queryPipeline"
import { runSoftCheck } from "@/agents/crm/tools/runSoftCheck"
import { sendWhatsapp } from "@/agents/crm/tools/sendWhatsapp"
import { generateWithTools } from "@/lib/gemini"
import type { AgentResponse, AuthenticatedPartner, GeminiMessage } from "@/types/agents"

export class AgentLoopError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AgentLoopError"
  }
}

function getCrmToolDeclarations() {
  return [
    {
      name: "send_whatsapp",
      description: "Send WhatsApp templates to clients or groups.",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["single", "bulk"] },
          message: { type: "object" },
          messages: { type: "array", items: { type: "object" } },
        },
        required: ["mode"],
      },
    },
    {
      name: "analyse_document",
      description: "Analyse uploaded document and check lender checklist gaps.",
      parameters: {
        type: "object",
        properties: {
          fileBase64: { type: "string" },
          mimeType: { type: "string" },
          documentType: { type: "string" },
          lenderName: { type: "string" },
          productType: { type: "string" },
          leadId: { type: "string" },
        },
        required: ["fileBase64", "mimeType", "documentType", "lenderName", "productType"],
      },
    },
    {
      name: "run_soft_check",
      description: "Run five-layer soft check on a lead.",
      parameters: {
        type: "object",
        properties: { leadId: { type: "string" } },
        required: ["leadId"],
      },
    },
    {
      name: "generate_briefing",
      description: "Generate partner morning briefing now.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "add_partner_note",
      description: "Add a note on a lead with visibility scope.",
      parameters: {
        type: "object",
        properties: {
          leadId: { type: "string" },
          note: { type: "string" },
          visibility: { type: "string" },
        },
        required: ["leadId", "note", "visibility"],
      },
    },
    {
      name: "query_pipeline",
      description: "Get active/stalled/pending pipeline snapshot and actions.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "get_commissions",
      description: "Get live commission snapshot.",
      parameters: { type: "object", properties: {} },
    },
  ]
}

async function executeTool(functionCall: { name: string; args?: Record<string, unknown> }, chatUser: AuthenticatedPartner) {
  const args = functionCall.args || {}

  if (functionCall.name === "send_whatsapp") {
    return sendWhatsapp(args as never, chatUser)
  }
  if (functionCall.name === "analyse_document") {
    return analyseDocument(args as never, chatUser)
  }
  if (functionCall.name === "run_soft_check") {
    return runSoftCheck(args as never, chatUser)
  }
  if (functionCall.name === "generate_briefing") {
    return generateBriefing({} as never, chatUser)
  }
  if (functionCall.name === "add_partner_note") {
    return addPartnerNote(args as never, chatUser)
  }
  if (functionCall.name === "query_pipeline") {
    return queryPipeline({} as never, chatUser)
  }
  if (functionCall.name === "get_commissions") {
    return getCommissions({} as never, chatUser)
  }

  throw new Error(`Unsupported CRM tool: ${functionCall.name}`)
}

function getToolsUsedFromHistory(messages: GeminiMessage[]) {
  const tools = new Set<string>()
  for (const message of messages) {
    if (typeof message.content === "string") {
      continue
    }
    for (const part of message.content.parts) {
      if (part.functionCall?.name) {
        tools.add(part.functionCall.name)
      }
    }
  }
  return Array.from(tools)
}

export async function runCrmAgent(
  message: string,
  conversationHistory: GeminiMessage[],
  chatUser: AuthenticatedPartner,
): Promise<AgentResponse> {
  const MAX_ITERATIONS = 8
  let iterations = 0
  const messages: GeminiMessage[] = [...conversationHistory, { role: "user", content: message }]

  while (iterations < MAX_ITERATIONS) {
    iterations += 1

    const response = await generateWithTools({
      systemInstruction: getCrmSystemPrompt(chatUser),
      tools: [{ functionDeclarations: getCrmToolDeclarations() }],
      messages,
      temperature: 0,
    })

    const candidate = response.candidates?.[0]
    if (!candidate?.content?.parts?.length) {
      break
    }

    if (candidate.content.parts.every((part) => part.text)) {
      return {
        text: candidate.content.parts.map((part) => part.text).join(""),
        toolsUsed: getToolsUsedFromHistory(messages),
        iterations,
      }
    }

    const toolCallParts = candidate.content.parts.filter((part) => part.functionCall)
    if (toolCallParts.length === 0) {
      break
    }

    messages.push({ role: "model", content: candidate.content })

    const toolResults = await Promise.all(
      toolCallParts.map((part) => executeTool(part.functionCall as { name: string; args?: Record<string, unknown> }, chatUser)),
    )

    messages.push({
      role: "user",
      content: {
        parts: toolResults.map((result, index) => ({
          functionResponse: {
            name: (toolCallParts[index].functionCall as { name: string }).name,
            response: result,
          },
        })),
      },
    })
  }

  throw new AgentLoopError("Max iterations reached without terminal response")
}
