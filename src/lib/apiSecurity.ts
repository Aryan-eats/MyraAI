import { NextRequest, NextResponse } from "next/server"

type RateLimiterOptions = {
  limit: number
  windowMs: number
  now?: () => number
}

type RateLimiterBucket = {
  count: number
  resetAt: number
}

export class MemoryRateLimiter {
  private readonly limit: number
  private readonly windowMs: number
  private readonly now: () => number
  private readonly buckets = new Map<string, RateLimiterBucket>()

  constructor({ limit, windowMs, now = () => Date.now() }: RateLimiterOptions) {
    this.limit = Math.max(1, limit)
    this.windowMs = Math.max(1_000, windowMs)
    this.now = now
  }

  consume(key: string) {
    const currentTime = this.now()
    const existing = this.buckets.get(key)

    if (!existing || existing.resetAt <= currentTime) {
      this.buckets.set(key, {
        count: 1,
        resetAt: currentTime + this.windowMs,
      })
      return { allowed: true, retryAfterSeconds: 0 }
    }

    if (existing.count >= this.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1_000)),
      }
    }

    existing.count += 1
    return { allowed: true, retryAfterSeconds: 0 }
  }
}

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value)
    return url.origin
  } catch {
    return null
  }
}

export function parseAllowedOrigins(rawValue = process.env.CHAT_ALLOWED_ORIGINS || "") {
  const uniqueOrigins = new Set<string>()

  for (const candidate of rawValue.split(",")) {
    const normalized = normalizeOrigin(candidate.trim())
    if (normalized) {
      uniqueOrigins.add(normalized)
    }
  }

  return Array.from(uniqueOrigins)
}

export function resolveAllowedOrigin(requestOrigin: string | null, allowedOrigins: string[]) {
  if (!requestOrigin) {
    return null
  }

  const normalizedOrigin = normalizeOrigin(requestOrigin)
  if (!normalizedOrigin) {
    return false
  }

  return allowedOrigins.includes(normalizedOrigin) ? normalizedOrigin : false
}

export function applyCorsHeaders(response: NextResponse, allowedOrigin: string | null) {
  if (allowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", allowedOrigin)
    response.headers.set("Vary", "Origin")
  }
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  return response
}

export function buildRateLimitKey(req: NextRequest, userId: string) {
  if (userId && userId !== "anonymous") {
    return `user:${userId}`
  }

  const forwardedFor = req.headers.get("x-forwarded-for")
  const ip = forwardedFor?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
  return `ip:${ip}`
}

export function getChatAllowedOrigins() {
  return parseAllowedOrigins()
}

export function createChatRateLimiter() {
  const limit = Number(process.env.CHAT_RATE_LIMIT_MAX || "30")
  const windowMs = Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS || "60000")
  return new MemoryRateLimiter({ limit, windowMs })
}
