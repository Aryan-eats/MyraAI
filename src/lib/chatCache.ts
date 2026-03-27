import Redis from "ioredis"
import type { GeminiMessage } from "@/types/agents"

export type CachedResponse = {
  answer: string
  intent: string
  toolName: string | null
  metadata?: Record<string, unknown>
  cachedAt: string
}

const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379"

function getRedisClient() {
  if (global.redisClient) {
    return global.redisClient
  }

  const redisUrl = process.env.REDIS_URL || DEFAULT_REDIS_URL
  global.redisClient = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true })
  return global.redisClient
}

async function connectRedis() {
  const redis = getRedisClient()
  await redis.connect().catch(() => undefined)
  return redis
}

export function buildCacheKey(userId: string, intentSlug: string) {
  return `chat:cache:${userId}:${intentSlug}`
}

export async function getCachedResponse(
  userId: string,
  intentSlug: string,
): Promise<CachedResponse | null> {
  const redis = await connectRedis()
  try {
    const cached = await redis.get(buildCacheKey(userId, intentSlug))
    if (!cached) {
      return null
    }
    return JSON.parse(cached) as CachedResponse
  } catch {
    return null
  }
}

export async function setCachedResponse(
  userId: string,
  intentSlug: string,
  response: Omit<CachedResponse, "cachedAt">,
  ttlSeconds: number,
): Promise<void> {
  const redis = await connectRedis()
  try {
    const payload: CachedResponse = { ...response, cachedAt: new Date().toISOString() }
    await redis.set(buildCacheKey(userId, intentSlug), JSON.stringify(payload), "EX", ttlSeconds)
  } catch {
    // Cache failures should not block chat replies.
  }
}

export async function invalidateUserCache(userId: string): Promise<void> {
  const redis = await connectRedis()
  const match = `chat:cache:${userId}:*`
  try {
    const keys = await redis.keys(match)
    if (keys.length) {
      await redis.del(...keys)
    }
  } catch {
    // Ignore invalidation failures.
  }
}

export async function getJson<T>(key: string): Promise<T | null> {
  const redis = await connectRedis()
  try {
    const value = await redis.get(key)
    if (!value) return null
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export async function setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = await connectRedis()
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds)
}

export async function deleteJson(key: string): Promise<void> {
  const redis = await connectRedis()
  try {
    await redis.del(key)
  } catch {
    // Cache cleanup should not block chat flows.
  }
}

export async function incrementRateLimitCounter(key: string, ttlSeconds: number): Promise<number> {
  const redis = await connectRedis()
  const current = await redis.incr(key)
  if (current === 1) {
    await redis.expire(key, ttlSeconds)
  }
  return current
}

export async function cachePipeline(partnerId: string, data: unknown): Promise<void> {
  await setJson(`crm:pipeline:${partnerId}`, data, 300)
}

export async function getCachedPipeline<T>(partnerId: string): Promise<T | null> {
  return getJson<T>(`crm:pipeline:${partnerId}`)
}

export async function cacheCommissions(partnerId: string, data: unknown): Promise<void> {
  await setJson(`crm:commissions:${partnerId}`, data, 1800)
}

export async function getCachedCommissions<T>(partnerId: string): Promise<T | null> {
  return getJson<T>(`crm:commissions:${partnerId}`)
}

export async function saveConversationInCache(sessionId: string, history: GeminiMessage[]): Promise<void> {
  const trimmed = history.length > 20 ? history.slice(history.length - 20) : history
  await setJson(`conv:${sessionId}`, trimmed, 7200)
}

export async function getConversationFromCache(sessionId: string): Promise<GeminiMessage[]> {
  return (await getJson<GeminiMessage[]>(`conv:${sessionId}`)) ?? []
}
