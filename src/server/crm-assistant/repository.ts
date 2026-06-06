import { demoApplications, demoClients, demoPartnerStats, demoSemanticMemories } from "@/server/crm-assistant/demo-data"
import {
  AssistantActor,
  ClientRecord,
  LoanApplicationRecord,
  PartnerStatRecord,
  SemanticMemoryRecord,
} from "@/server/crm-assistant/types"

function assertPartnerScope(actor: AssistantActor, partnerId: string) {
  if (actor.role === "admin") {
    return
  }
  if (!actor.partnerId || actor.partnerId !== partnerId) {
    throw new Error("Access denied for requested partner scope.")
  }
}

export class DemoCrmRepository {
  async listPendingCases(actor: AssistantActor): Promise<LoanApplicationRecord[]> {
    const partnerId = actor.role === "admin" ? actor.partnerId ?? "partner_1" : actor.partnerId
    if (!partnerId) {
      throw new Error("Partner scope is required.")
    }
    assertPartnerScope(actor, partnerId)

    return demoApplications.filter((application) => {
      return application.partnerId === partnerId && application.status === "active"
    })
  }

  async listCasesWithPendingDocuments(actor: AssistantActor) {
    const partnerId = actor.role === "admin" ? actor.partnerId ?? "partner_1" : actor.partnerId
    if (!partnerId) {
      throw new Error("Partner scope is required.")
    }
    assertPartnerScope(actor, partnerId)

    return demoApplications
      .filter((application) => application.partnerId === partnerId && application.missingDocuments.length > 0)
      .map((application) => ({
        application,
        client: demoClients.find((client) => client.id === application.clientId) as ClientRecord,
      }))
  }

  async getPartnerStats(actor: AssistantActor, month?: string): Promise<PartnerStatRecord[]> {
    const partnerId = actor.role === "admin" ? actor.partnerId ?? "partner_1" : actor.partnerId
    if (!partnerId) {
      throw new Error("Partner scope is required.")
    }
    assertPartnerScope(actor, partnerId)

    const stats = demoPartnerStats.filter((entry) => entry.partnerId === partnerId)
    if (!month) {
      return stats.sort((a, b) => a.month.localeCompare(b.month))
    }
    return stats.filter((entry) => entry.month === month)
  }

  async getClientDetails(actor: AssistantActor, clientId: string) {
    const client = demoClients.find((entry) => entry.id === clientId)
    if (!client) {
      return null
    }
    assertPartnerScope(actor, client.partnerId)

    const applications = demoApplications.filter((application) => application.clientId === clientId)
    return {
      client,
      applications,
      semanticMemories: demoSemanticMemories.filter((memory) => memory.clientId === clientId),
    }
  }

  async createClient(actor: AssistantActor, input: Omit<ClientRecord, "partnerId">) {
    const partnerId = actor.role === "admin" ? actor.partnerId ?? "partner_1" : actor.partnerId
    if (!partnerId) {
      throw new Error("Partner scope is required.")
    }

    const record: ClientRecord = { ...input, partnerId }
    demoClients.push(record)
    return record
  }

  async updateCaseStatus(actor: AssistantActor, applicationId: string, stage: string) {
    const application = demoApplications.find((entry) => entry.id === applicationId)
    if (!application) {
      return null
    }
    assertPartnerScope(actor, application.partnerId)
    application.stage = stage
    application.lastActivityAt = new Date().toISOString()
    return application
  }

  async searchSemanticMemories(actor: AssistantActor, query: string, clientId?: string): Promise<SemanticMemoryRecord[]> {
    const partnerId = actor.role === "admin" ? actor.partnerId ?? "partner_1" : actor.partnerId
    if (!partnerId) {
      return []
    }
    assertPartnerScope(actor, partnerId)

    const tokens = query.toLowerCase().split(/\W+/).filter(Boolean)
    return demoSemanticMemories
      .filter((memory) => memory.partnerId === partnerId)
      .filter((memory) => !clientId || memory.clientId === clientId)
      .map((memory) => {
        const haystack = `${memory.content} ${memory.summary} ${memory.tags.join(" ")}`.toLowerCase()
        const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0)
        return { memory, score }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((entry) => entry.memory)
  }

  async addSemanticMemory(record: SemanticMemoryRecord) {
    demoSemanticMemories.unshift(record)
    return record
  }

  async resolveClientReference(actor: AssistantActor, text: string) {
    const partnerId = actor.role === "admin" ? actor.partnerId ?? "partner_1" : actor.partnerId
    if (!partnerId) {
      return null
    }
    const normalized = text.toLowerCase()
    return (
      demoClients.find(
        (client) => client.partnerId === partnerId && normalized.includes(client.fullName.toLowerCase()),
      ) ?? null
    )
  }

  async getApplicationById(actor: AssistantActor, applicationId: string): Promise<LoanApplicationRecord | null> {
    const application = demoApplications.find((entry) => entry.id === applicationId) ?? null
    if (!application) {
      return null
    }
    assertPartnerScope(actor, application.partnerId)
    return application
  }

  async listClients(actor: AssistantActor): Promise<ClientRecord[]> {
    const partnerId = actor.role === "admin" ? actor.partnerId ?? "partner_1" : actor.partnerId
    if (!partnerId) {
      return []
    }
    assertPartnerScope(actor, partnerId)
    return demoClients.filter((client) => client.partnerId === partnerId)
  }

  async listPartnerStatSeries(actor: AssistantActor): Promise<PartnerStatRecord[]> {
    return this.getPartnerStats(actor)
  }
}
