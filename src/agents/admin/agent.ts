import { getAdminChatbotPrompt } from "@/agents/admin/persona"
import { getBankStats } from "@/agents/admin/tools/getBankStats"
import { getLeadsByStatusAdmin } from "@/agents/admin/tools/getLeadsByStatusAdmin"
import { getPartnerPerformance } from "@/agents/admin/tools/getPartnerPerformance"
import { getPlatformOverview } from "@/agents/admin/tools/getPlatformOverview"
import type { AuthenticatedAdmin } from "@/lib/chatAuth"
import { generateWithTools } from "@/lib/gemini"
import { answerLoanQuestion } from "@/lib/loanAnswering"
import type { AgentResponse, GeminiMessage } from "@/types/agents"

/** Read-only platform-wide tool declarations for the admin chatbot (Stage 1). */
function getAdminToolDeclarations() {
  return [
    {
      name: "search_loan_knowledge",
      description:
        "Answer general borrower questions about banks and loans. Searches GPS India PostgreSQL data first, then Firecrawl web search only when database data is unavailable. Include returned marking in web-search answers.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          loanType: { type: "string" },
          bankCode: { type: "string" },
        },
        required: ["query"],
      },
    },
    {
      name: "get_platform_overview",
      description: "Platform-wide totals: total leads, active leads, disbursals, total disbursed, and number of active partners.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "get_partner_performance",
      description: "Partners ranked by disbursals. Optionally pass partnerName to filter to one partner, or limit to cap the ranking length.",
      parameters: {
        type: "object",
        properties: {
          partnerName: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
    {
      name: "get_bank_stats",
      description: "Lead volume and approval rate broken down by assigned bank.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "get_leads_by_status",
      description:
        "List leads in a specific status across all partners. Pass status (e.g. docs_pending, submitted, bank_processing, approved, disbursed, rejected) and optionally limit.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string" },
          limit: { type: "number" },
        },
        required: ["status"],
      },
    },
  ]
}

async function executeAdminTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "search_loan_knowledge":
      return answerLoanQuestion({
        query: String(args.query || ""),
        ...(args.loanType ? { loanType: String(args.loanType) } : {}),
        ...(args.bankCode ? { bankCode: String(args.bankCode) } : {}),
      })
    case "get_platform_overview":
      return getPlatformOverview()
    case "get_partner_performance":
      return getPartnerPerformance({
        partnerName: args.partnerName ? String(args.partnerName) : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      })
    case "get_bank_stats":
      return getBankStats()
    case "get_leads_by_status":
      return getLeadsByStatusAdmin({
        status: String(args.status || ""),
        limit: typeof args.limit === "number" ? args.limit : undefined,
      })
    default:
      throw new Error(`Unsupported admin tool: ${name}`)
  }
}

function fallbackReply() {
  return "I can show platform totals, rank partners by performance, break down approval rates by bank, or list leads in any status. What would you like to know?"
}

/** Read-only admin chatbot loop. Never throws to the caller. */
export async function runAdminChatbot(
  message: string,
  conversationHistory: GeminiMessage[],
  admin: AuthenticatedAdmin,
): Promise<AgentResponse> {
  const MAX_ITERATIONS = 6
  let iterations = 0
  const messages: GeminiMessage[] = [...conversationHistory, { role: "user", content: message }]
  const toolsUsed = new Set<string>()

  while (iterations < MAX_ITERATIONS) {
    iterations += 1

    let response
    try {
      response = await generateWithTools({
        systemInstruction: getAdminChatbotPrompt(admin),
        tools: [{ functionDeclarations: getAdminToolDeclarations() }],
        messages,
        temperature: 0,
      })
    } catch {
      return { text: fallbackReply(), toolsUsed: Array.from(toolsUsed), iterations }
    }

    const candidate = response.candidates?.[0]
    if (!candidate?.content?.parts?.length) {
      break
    }

    const toolCallParts = candidate.content.parts.filter((part) => part.functionCall)
    if (toolCallParts.length === 0) {
      const text = candidate.content.parts.map((part) => part.text || "").join("").trim()
      return { text: text || fallbackReply(), toolsUsed: Array.from(toolsUsed), iterations }
    }

    messages.push({ role: "model", content: candidate.content })

    const toolResults = await Promise.all(
      toolCallParts.map(async (part) => {
        const call = part.functionCall as { name: string; args?: Record<string, unknown> }
        toolsUsed.add(call.name)
        try {
          return await executeAdminTool(call.name, call.args || {})
        } catch (error) {
          return { error: error instanceof Error ? error.message : "tool failed" }
        }
      }),
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

  return { text: fallbackReply(), toolsUsed: Array.from(toolsUsed), iterations }
}
