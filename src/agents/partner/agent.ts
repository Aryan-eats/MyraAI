import { getPartnerChatbotPrompt } from "@/agents/partner/persona"
import { getCommissionOverview } from "@/agents/partner/tools/getCommissionOverview"
import { getLeadStatus } from "@/agents/partner/tools/getLeadStatus"
import { getMissingDocsList } from "@/agents/partner/tools/getMissingDocsList"
import { getPipelineOverview } from "@/agents/partner/tools/getPipelineOverview"
import { getStalledLeadsList } from "@/agents/partner/tools/getStalledLeadsList"
import { generateWithTools } from "@/lib/gemini"
import { answerLoanQuestion } from "@/lib/loanAnswering"
import type { AgentResponse, AuthenticatedPartner, GeminiMessage } from "@/types/agents"

/** Read-only tool declarations for the partner chatbot (Stage 1). */
function getPartnerToolDeclarations() {
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
      name: "get_pipeline_overview",
      description: "Get a summary of the partner's pipeline: total/active/stalled lead counts, counts by status, pending commission and total disbursed.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "get_lead_status",
      description:
        "Look up lead status by client name OR by status. Pass name to find a specific client's lead, or status (e.g. docs_pending, submitted, bank_processing, approved, disbursed, rejected) to list leads in that status.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          status: { type: "string" },
        },
      },
    },
    {
      name: "get_missing_docs_list",
      description: "List the partner's leads that need document attention (in docs_pending status or with pending/rejected uploaded documents).",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "get_commission_overview",
      description: "Get the partner's commission totals for the current month, broken down by pending/processing/paid.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "get_stalled_leads",
      description: "List the partner's non-terminal leads with no activity in the last N days (default 5). Pass olderThanDays to change the window.",
      parameters: {
        type: "object",
        properties: { olderThanDays: { type: "number" } },
      },
    },
  ]
}

async function executePartnerTool(
  name: string,
  args: Record<string, unknown>,
  partnerOrgId: string,
): Promise<unknown> {
  switch (name) {
    case "search_loan_knowledge":
      return answerLoanQuestion({
        query: String(args.query || ""),
        ...(args.loanType ? { loanType: String(args.loanType) } : {}),
        ...(args.bankCode ? { bankCode: String(args.bankCode) } : {}),
      })
    case "get_pipeline_overview":
      return getPipelineOverview(partnerOrgId)
    case "get_lead_status":
      return getLeadStatus(partnerOrgId, {
        name: args.name ? String(args.name) : undefined,
        status: args.status ? String(args.status) : undefined,
      })
    case "get_missing_docs_list":
      return getMissingDocsList(partnerOrgId)
    case "get_commission_overview":
      return getCommissionOverview(partnerOrgId)
    case "get_stalled_leads":
      return getStalledLeadsList(
        partnerOrgId,
        typeof args.olderThanDays === "number" ? args.olderThanDays : undefined,
      )
    default:
      throw new Error(`Unsupported partner tool: ${name}`)
  }
}

function fallbackReply() {
  return "I can summarise your pipeline, look up a lead's status, list leads with pending documents or stalled cases, and show your commission figures. What would you like to see?"
}

/**
 * Read-only partner chatbot loop. Mirrors the CRM agent's multi-tool loop but
 * with read-only tools and graceful degradation (never throws to the caller).
 */
export async function runPartnerChatbot(
  message: string,
  conversationHistory: GeminiMessage[],
  partner: AuthenticatedPartner,
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
        systemInstruction: getPartnerChatbotPrompt(partner),
        tools: [{ functionDeclarations: getPartnerToolDeclarations() }],
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
          return await executePartnerTool(call.name, call.args || {}, partner.partnerId)
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
