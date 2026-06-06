import { buildCacheKey } from "@/lib/chatCache"
import { SemanticMemoryRecord, SessionMemory } from "@/server/crm-assistant/types"
import Redis from "ioredis"

const DEFAULT_SESSION_TTL = 60 * 60 * 24

function getRedisClient() {
  if (global.redisClient) {
    return global.redisClient
  }

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    return null
  }

  global.redisClient = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true })
  return global.redisClient
}

const localSessionMemory = new Map<string, SessionMemory>()
const localSemanticMemory = new Map<string, SemanticMemoryRecord[]>()

function sessionKey(sessionId: string) {
  return buildCacheKey("crm-session", sessionId)
}

export class SessionMemoryStore {
  async get(sessionId: string, conversationId?: string): Promise<SessionMemory> {
    const redis = getRedisClient()
    if (redis) {
      try {
        await redis.connect().catch(() => undefined)
        const value = await redis.get(sessionKey(sessionId))
        if (value) {
          return JSON.parse(value) as SessionMemory
        }
      } catch {
        // Fall back to in-process memory for local development.
      }
    }

    return (
      localSessionMemory.get(sessionId) ?? {
        sessionId,
        conversationId: conversationId ?? `conv_${sessionId}`,
        recentQueries: [],
      }
    )
  }

  async set(session: SessionMemory) {
    const redis = getRedisClient()
    if (redis) {
      try {
        await redis.connect().catch(() => undefined)
        await redis.set(sessionKey(session.sessionId), JSON.stringify(session), "EX", DEFAULT_SESSION_TTL)
      } catch {
        localSessionMemory.set(session.sessionId, session)
        return
      }
    }

    localSessionMemory.set(session.sessionId, session)
  }
}

export class SemanticMemoryStore {
  async recall(partnerId: string, query: string, records: SemanticMemoryRecord[]) {
    const local = localSemanticMemory.get(partnerId) ?? records
    const tokens = query.toLowerCase().split(/\W+/).filter(Boolean)
    return local
      .map((memory) => {
        const haystack = `${memory.summary} ${memory.content} ${memory.tags.join(" ")}`.toLowerCase()
        const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0)
        return { memory, score }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((entry) => entry.memory)
  }

  async remember(partnerId: string, memory: SemanticMemoryRecord) {
    const current = localSemanticMemory.get(partnerId) ?? []
    localSemanticMemory.set(partnerId, [memory, ...current].slice(0, 50))
  }
}
