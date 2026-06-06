import { buildApprovalInsights, buildClientHealth } from "@/server/crm-assistant/analytics"
import { DemoCrmRepository } from "@/server/crm-assistant/repository"
import { ToolExecutionContext, ToolExecutionResult } from "@/server/crm-assistant/types"

type ToolHandler = (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolExecutionResult>

export class AssistantToolRegistry {
  constructor(private readonly repository: DemoCrmRepository) {}

  get(toolName: string): ToolHandler {
    const handler = this.handlers[toolName]
    if (!handler) {
      throw new Error(`Tool ${toolName} is not registered.`)
    }
    return handler.bind(this)
  }

  private handlers: Record<string, ToolHandler> = {
    get_pending_cases: async (_args, context) => {
      const cases = await this.repository.listPendingCases(context.actor)
      return {
        toolName: "get_pending_cases",
        data: { cases },
        summary: `${cases.length} active cases are currently pending action.`,
        reasoning: ["Loaded active applications for the partner scope."],
        recommendedActions: cases.slice(0, 3).map((item) => ({
          label: `Open ${item.id}`,
          type: "open_application",
          payload: { applicationId: item.id, clientId: item.clientId },
        })),
        memoryUpdate: {
          lastApplicationId: cases[0]?.id,
          lastClientId: cases[0]?.clientId,
        },
      }
    },
    get_pending_documents: async (_args, context) => {
      const stuckCases = await this.repository.listCasesWithPendingDocuments(context.actor)
      return {
        toolName: "get_pending_documents",
        data: { stuckCases },
        summary: `${stuckCases.length} clients are blocked because documents are still pending.`,
        reasoning: [
          "Filtered to cases with missing documents.",
          "Joined applications to client records for partner-facing actionability.",
        ],
        recommendedActions: stuckCases.slice(0, 3).map((item) => ({
          label: `Call ${item.client.fullName}`,
          type: "contact_client",
          payload: { clientId: item.client.id, applicationId: item.application.id },
        })),
        memoryUpdate: {
          lastApplicationId: stuckCases[0]?.application.id,
          lastClientId: stuckCases[0]?.client.id,
        },
      }
    },
    get_partner_stats: async (_args, context) => {
      const series = await this.repository.listPartnerStatSeries(context.actor)
      const insight = buildApprovalInsights(series)
      return {
        toolName: "get_partner_stats",
        data: { series, insight },
        summary: insight.previous
          ? `Approval rate moved from ${insight.previousRate}% to ${insight.latestRate}%.`
          : `Current approval rate is ${insight.latestRate}%.`,
        reasoning: [
          "Calculated approval rate as approvals divided by submitted applications.",
          insight.primaryDriver,
        ],
      }
    },
    get_client_details: async (args, context) => {
      const clientId = String(args.clientId ?? context.session.lastClientId ?? "")
      const details = await this.repository.getClientDetails(context.actor, clientId)
      if (!details) {
        throw new Error("Client not found.")
      }
      return {
        toolName: "get_client_details",
        data: details,
        summary: `Fetched client profile for ${details.client.fullName}.`,
        reasoning: ["Loaded the client profile, applications, and prior memory references."],
        memoryUpdate: {
          lastClientId: details.client.id,
          lastApplicationId: details.applications[0]?.id,
        },
      }
    },
    get_client_recommendation: async (args, context) => {
      const clientId = String(args.clientId ?? context.session.lastClientId ?? "")
      const details = await this.repository.getClientDetails(context.actor, clientId)
      if (!details) {
        throw new Error("Client context is missing.")
      }
      const health = buildClientHealth(details.client, details.applications)
      return {
        toolName: "get_client_recommendation",
        data: { ...details, health },
        summary: `${details.client.fullName} has ${health.issues.length} key risk signals to address.`,
        reasoning: [`FOIR evaluated at ${health.foir}%.`, ...health.issues],
        recommendedActions: health.nextSteps.map((step, index) => ({
          label: `Next step ${index + 1}`,
          type: "recommended_action",
          payload: { clientId: details.client.id, text: step },
        })),
        memoryUpdate: {
          lastClientId: details.client.id,
          lastApplicationId: health.latestApplication?.id,
        },
      }
    },
    update_case_status: async (args, context) => {
      const applicationId = String(args.applicationId ?? context.session.lastApplicationId ?? "")
      const stage = String(args.stage ?? "Under Review")
      const updated = await this.repository.updateCaseStatus(context.actor, applicationId, stage)
      if (!updated) {
        throw new Error("Application not found.")
      }
      return {
        toolName: "update_case_status",
        data: { application: updated },
        summary: `Case ${updated.id} moved to ${updated.stage}.`,
        reasoning: ["Updated the application stage inside the partner scope."],
        memoryUpdate: {
          lastApplicationId: updated.id,
          lastClientId: updated.clientId,
        },
      }
    },
    create_client: async (args, context) => {
      const created = await this.repository.createClient(context.actor, {
        id: `client_${Date.now()}`,
        fullName: String(args.fullName ?? "New Client"),
        city: String(args.city ?? "Unknown"),
        employmentType: args.employmentType === "self_employed" ? "self_employed" : "salaried",
        monthlyIncome: Number(args.monthlyIncome ?? 0),
        existingEmi: Number(args.existingEmi ?? 0),
        requestedLoanAmount: Number(args.requestedLoanAmount ?? 0),
        cibilScore: Number(args.cibilScore ?? 0),
      })
      return {
        toolName: "create_client",
        data: { client: created },
        summary: `Created client ${created.fullName}.`,
        reasoning: ["Inserted a new client in the scoped partner dataset."],
        memoryUpdate: {
          lastClientId: created.id,
        },
      }
    },
  }
}
