import { SemanticMemoryStore, SessionMemoryStore } from "@/server/crm-assistant/memory"
import { DemoCrmRepository } from "@/server/crm-assistant/repository"
import { AssistantActor, ChatMessage, SessionMemory } from "@/server/crm-assistant/types"

export type AssistantContext = {
  actor: AssistantActor
  session: SessionMemory
  recentConversation: ChatMessage[]
  portfolioSnapshot: {
    activeCases: number
    clients: number
  }
  recalledMemories: string[]
}

export class AssistantContextBuilder {
  constructor(
    private readonly repository: DemoCrmRepository,
    private readonly sessionMemory: SessionMemoryStore,
    private readonly semanticMemory: SemanticMemoryStore,
  ) {}

  async build(params: {
    actor: AssistantActor
    sessionId: string
    conversationId?: string
    message: string
    conversation?: ChatMessage[]
  }): Promise<AssistantContext> {
    const session = await this.sessionMemory.get(params.sessionId, params.conversationId)
    const [cases, clients, baseMemories] = await Promise.all([
      this.repository.listPendingCases(params.actor),
      this.repository.listClients(params.actor),
      this.repository.searchSemanticMemories(params.actor, params.message, session.lastClientId),
    ])

    const recalled = params.actor.partnerId
      ? await this.semanticMemory.recall(params.actor.partnerId, params.message, baseMemories)
      : []

    return {
      actor: params.actor,
      session,
      recentConversation: params.conversation?.slice(-6) ?? [],
      portfolioSnapshot: {
        activeCases: cases.length,
        clients: clients.length,
      },
      recalledMemories: recalled.map((memory) => memory.summary),
    }
  }
}
