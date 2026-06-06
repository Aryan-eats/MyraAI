import Redis from "ioredis"
import mongoose, { Schema } from "mongoose"
import connectDb from "@/lib/db"
import {
  generateText as generateTextWithFallback,
  generateWithTools as generateWithToolsWithFallback,
} from "@/lib/llm/router"
import type { GeminiMessage, ChatSessionSummary } from "@/types/agents"

const CONVERSATION_TTL_SECONDS = 60 * 60 * 2
const MAX_TURNS = 20
const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379"

const sessionSummarySchema = new Schema<ChatSessionSummary>(
  {
    sessionId: { type: String, required: true, index: true },
    facts: { type: [String], default: [] },
    leadCaptured: {
      name: { type: String },
      phone: { type: String },
    },
    analysedDocuments: { type: [String], default: [] },
    notesAdded: { type: Number, default: 0 },
    endedAt: { type: String, required: true },
  },
  { collection: "conversation_summaries", timestamps: true },
)

const SessionSummaryModel =
  (mongoose.models.ConversationSummary as mongoose.Model<ChatSessionSummary>) ||
  mongoose.model<ChatSessionSummary>("ConversationSummary", sessionSummarySchema)

function getRedisClient() {
  if (global.redisClient) {
    return global.redisClient
  }
  const client = new Redis(process.env.REDIS_URL || DEFAULT_REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  })
  global.redisClient = client
  return client
}

function normalizeHistory(messages: GeminiMessage[]): GeminiMessage[] {
  if (messages.length <= MAX_TURNS) {
    return messages
  }
  return messages.slice(messages.length - MAX_TURNS)
}

export async function loadConversationHistory(sessionId: string): Promise<GeminiMessage[]> {
  try {
    const redis = getRedisClient()
    await redis.connect().catch(() => undefined)
    const key = `conv:${sessionId}`
    const value = await redis.get(key)
    if (!value) {
      return []
    }
    const parsed = JSON.parse(value) as GeminiMessage[]
    return parsed
  } catch {
    return []
  }
}

export async function saveConversationHistory(sessionId: string, history: GeminiMessage[]): Promise<void> {
  try {
    const redis = getRedisClient()
    await redis.connect().catch(() => undefined)
    const trimmed = normalizeHistory(history)
    const key = `conv:${sessionId}`
    await redis.set(key, JSON.stringify(trimmed), "EX", CONVERSATION_TTL_SECONDS)
  } catch {
    // Degrade gracefully when Redis is unavailable.
  }
}

export async function appendConversationMessage(sessionId: string, message: GeminiMessage): Promise<GeminiMessage[]> {
  const current = await loadConversationHistory(sessionId)
  const next = normalizeHistory([...current, message])
  await saveConversationHistory(sessionId, next)
  return next
}

export async function summarizeAndCloseConversation(
  sessionId: string,
  facts: Omit<ChatSessionSummary, "sessionId" | "endedAt">,
): Promise<void> {
  await connectDb()

  await SessionSummaryModel.create({
    sessionId,
    facts: facts.facts,
    leadCaptured: facts.leadCaptured,
    analysedDocuments: facts.analysedDocuments,
    notesAdded: facts.notesAdded,
    endedAt: new Date().toISOString(),
  })

  try {
    const redis = getRedisClient()
    await redis.connect().catch(() => undefined)
    await redis.del(`conv:${sessionId}`)
  } catch {
    // Conversation may already be evicted or Redis may be down.
  }
}

export async function generateWithTools(params: {
  systemInstruction: string
  messages: GeminiMessage[]
  tools?: ReadonlyArray<{
    functionDeclarations: ReadonlyArray<{
      name: string
      description?: string
      parameters?: Record<string, unknown>
    }>
  }>
  temperature?: number
}) {
  const result = await generateWithToolsWithFallback(params)
  return result as {
    text?: string
    candidates: Array<{
      content: {
        parts: Array<{
          text?: string
          functionCall?: {
            name: string
            args?: Record<string, unknown>
          }
        }>
      }
    }>
  }
}

export async function generateText(params: {
  systemInstruction?: string
  message: string
  temperature?: number
  jsonMode?: boolean
}) {
  return generateTextWithFallback(params)
}
