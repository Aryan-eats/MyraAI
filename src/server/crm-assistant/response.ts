import { AssistantContext } from "@/server/crm-assistant/context-builder"
import { ToolExecutionResult } from "@/server/crm-assistant/types"

function formatPendingCases(result: ToolExecutionResult) {
  const cases = (result.data as { cases: Array<{ id: string; stage: string; lenderName: string }> }).cases
  const lines = cases.slice(0, 5).map((item) => `- ${item.id}: ${item.stage} with ${item.lenderName}`)
  return `${result.summary}\n${lines.join("\n")}`
}

function formatPendingDocuments(result: ToolExecutionResult) {
  const stuckCases = (
    result.data as {
      stuckCases: Array<{ client: { fullName: string }; application: { missingDocuments: string[] } }>
    }
  ).stuckCases
  const lines = stuckCases
    .slice(0, 5)
    .map((item) => `- ${item.client.fullName}: ${item.application.missingDocuments.join(", ")}`)
  return `${result.summary}\n${lines.join("\n")}`
}

function formatPartnerStats(result: ToolExecutionResult) {
  const insight = (result.data as { insight: { latestRate: number; primaryDriver: string } }).insight
  return `${result.summary} ${insight.primaryDriver}`
}

function formatClientRecommendation(result: ToolExecutionResult) {
  const payload = result.data as {
    client: { fullName: string; cibilScore: number }
    health: { foir: number; issues: string[]; nextSteps: string[] }
  }
  return `${payload.client.fullName} needs attention. FOIR is ${payload.health.foir}% and CIBIL is ${payload.client.cibilScore}. ${payload.health.issues.join(" ")} Next: ${payload.health.nextSteps.join(" ")}`
}

export function composeAssistantAnswer(result: ToolExecutionResult, context: AssistantContext) {
  const base = (() => {
    switch (result.toolName) {
      case "get_pending_cases":
        return formatPendingCases(result)
      case "get_pending_documents":
        return formatPendingDocuments(result)
      case "get_partner_stats":
        return formatPartnerStats(result)
      case "get_client_recommendation":
      case "get_client_details":
        return formatClientRecommendation(result)
      default:
        return result.summary
    }
  })()

  const memoryHint = context.recalledMemories.length
    ? `\nRelevant memory: ${context.recalledMemories.slice(0, 2).join(" ")}`
    : ""
  const portfolioHint = `\nPortfolio context: ${context.portfolioSnapshot.activeCases} active cases across ${context.portfolioSnapshot.clients} clients.`

  return `${base}${memoryHint}${portfolioHint}`.trim()
}
