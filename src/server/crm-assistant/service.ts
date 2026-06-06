import { AssistantContextBuilder } from "@/server/crm-assistant/context-builder"
import { SemanticMemoryStore, SessionMemoryStore } from "@/server/crm-assistant/memory"
import { AssistantPlanner, mergeRecentQuery } from "@/server/crm-assistant/planner"
import { DemoCrmRepository } from "@/server/crm-assistant/repository"
import { composeAssistantAnswer } from "@/server/crm-assistant/response"
import { AssistantToolRegistry } from "@/server/crm-assistant/tools"
import { AssistantRequest, AssistantResponse, SemanticMemoryRecord } from "@/server/crm-assistant/types"

export class CrmAssistantService {
  private readonly repository = new DemoCrmRepository()
  private readonly sessionMemory = new SessionMemoryStore()
  private readonly semanticMemory = new SemanticMemoryStore()
  private readonly contextBuilder = new AssistantContextBuilder(
    this.repository,
    this.sessionMemory,
    this.semanticMemory,
  )
  private readonly planner = new AssistantPlanner(this.repository)
  private readonly tools = new AssistantToolRegistry(this.repository)

  async handle(request: AssistantRequest): Promise<AssistantResponse> {
    if (!request.actor.partnerId && request.actor.role !== "admin") {
      throw new Error("Partner scope is required for CRM assistant requests.")
    }

    const sessionId = request.sessionId ?? request.conversationId ?? `sess_${request.actor.userId}`
    const context = await this.contextBuilder.build({
      actor: request.actor,
      sessionId,
      conversationId: request.conversationId,
      message: request.message,
      conversation: request.conversation,
    })

    const plan = await this.planner.plan(request.message, {
      actor: request.actor,
      session: context.session,
      now: new Date(),
    })

    if (!plan.toolName) {
      const updatedSession = {
        ...mergeRecentQuery(context.session, request.message, plan.intent),
        conversationId: context.session.conversationId,
      }
      await this.sessionMemory.set(updatedSession)

      return {
        answer: plan.directAnswer ?? "How can I help with your CRM workflow?",
        intent: plan.intent,
        conversationId: updatedSession.conversationId,
        reasoning: plan.reasoning,
        actions: [],
        memory: {
          lastClientId: updatedSession.lastClientId,
          lastApplicationId: updatedSession.lastApplicationId,
        },
      }
    }

    const tool = this.tools.get(plan.toolName)
    const toolResult = await tool(plan.arguments, {
      actor: request.actor,
      session: context.session,
      now: new Date(),
    })

    const updatedSession = {
      ...mergeRecentQuery(context.session, request.message, plan.intent),
      ...toolResult.memoryUpdate,
      conversationId: context.session.conversationId,
    }
    await this.sessionMemory.set(updatedSession)

    if (request.actor.partnerId) {
      const memoryRecord: SemanticMemoryRecord = {
        id: `mem_${Date.now()}`,
        partnerId: request.actor.partnerId,
        clientId: toolResult.memoryUpdate?.lastClientId,
        content: `${request.message} => ${toolResult.summary}`,
        summary: toolResult.summary,
        tags: [plan.intent, plan.toolName],
        createdAt: new Date().toISOString(),
      }
      await this.semanticMemory.remember(request.actor.partnerId, memoryRecord)
      await this.repository.addSemanticMemory(memoryRecord)
    }

    return {
      answer: composeAssistantAnswer(toolResult, context),
      intent: plan.intent,
      conversationId: updatedSession.conversationId,
      reasoning: [...plan.reasoning, ...toolResult.reasoning],
      data: toolResult.data as Record<string, unknown>,
      actions: toolResult.recommendedActions,
      memory: {
        lastClientId: updatedSession.lastClientId,
        lastApplicationId: updatedSession.lastApplicationId,
      },
    }
  }
}
