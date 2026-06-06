import { DemoCrmRepository } from "@/server/crm-assistant/repository"
import { PlannerResult, SessionMemory, ToolExecutionContext } from "@/server/crm-assistant/types"

function extractTrailingValue(input: string, label: string) {
  const regex = new RegExp(`${label}\\s+(.+)$`, "i")
  const match = input.match(regex)
  return match?.[1]?.trim()
}

export class AssistantPlanner {
  constructor(private readonly repository: DemoCrmRepository) {}

  async plan(message: string, context: ToolExecutionContext): Promise<PlannerResult> {
    const text = message.toLowerCase().trim()
    const referencedClient = await this.repository.resolveClientReference(context.actor, message)

    if (["hi", "hello", "hey", "good morning", "good afternoon", "good evening"].includes(text)) {
      return {
        intent: "general.greeting",
        directAnswer:
          "I am the GPS India CRM assistant. I can show pending cases, document bottlenecks, approval trends, and client-level loan risks.",
        toolName: null,
        arguments: {},
        reasoning: ["The user sent a greeting, so no CRM tool call is needed."],
      }
    }

    if (
      text.includes("who are you") ||
      text.includes("what are you") ||
      text.includes("what can you do")
    ) {
      return {
        intent: "general.identity",
        directAnswer:
          "I am the GPS India CRM assistant for partners and loan agents. I can analyze pipeline blockers, review client risk, track pending documents, explain approval trends, and trigger CRM actions.",
        toolName: null,
        arguments: {},
        reasoning: ["The user is asking about assistant identity or capabilities."],
      }
    }

    if (text.includes("pending case")) {
      return {
        intent: "cases.pending",
        toolName: "get_pending_cases",
        arguments: {},
        reasoning: ["The user is asking for active/pending cases in their pipeline."],
      }
    }

    if (text.includes("document") && (text.includes("stuck") || text.includes("pending"))) {
      return {
        intent: "pipeline.docs_pending",
        toolName: "get_pending_documents",
        arguments: {},
        reasoning: ["The user wants cases blocked by missing documents."],
      }
    }

    if (text.includes("approval") || text.includes("approvals")) {
      return {
        intent: "partner.approval_insights",
        toolName: "get_partner_stats",
        arguments: {},
        reasoning: ["The user is asking for approval trend or conversion insight."],
      }
    }

    if (text.includes("create client")) {
      const name = extractTrailingValue(message, "create client") ?? "New Client"
      return {
        intent: "client.create",
        toolName: "create_client",
        arguments: {
          fullName: name,
          city: "Unknown",
          employmentType: "salaried",
          monthlyIncome: 0,
          existingEmi: 0,
          requestedLoanAmount: 0,
          cibilScore: 0,
        },
        reasoning: ["The user is requesting a client creation workflow."],
      }
    }

    if (text.includes("update status") || text.includes("move case")) {
      return {
        intent: "case.update",
        toolName: "update_case_status",
        arguments: {
          applicationId: context.session.lastApplicationId,
          stage: "Under Review",
        },
        reasoning: ["The user is requesting a case stage update."],
      }
    }

    if (referencedClient || context.session.lastClientId || text.includes("this client")) {
      return {
        intent: "client.intelligence",
        toolName: "get_client_recommendation",
        arguments: {
          clientId: referencedClient?.id ?? context.session.lastClientId,
        },
        reasoning: ["The user is asking about a specific client or continuing client context."],
      }
    }

    return {
      intent: "general.help",
      directAnswer:
        "Ask me about pending cases, clients stuck on documents, approval trends, specific client issues, or case updates.",
      toolName: null,
      arguments: {},
      reasoning: ["The request is broad, so the assistant should clarify capabilities instead of forcing analytics."],
    }
  }
}

export function mergeRecentQuery(session: SessionMemory, message: string, intent: string): SessionMemory {
  return {
    ...session,
    lastIntent: intent,
    recentQueries: [message, ...session.recentQueries].slice(0, 6),
  }
}
