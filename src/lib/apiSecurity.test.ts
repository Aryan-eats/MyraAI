import { describe, expect, it } from "vitest"

import { MemoryRateLimiter, parseAllowedOrigins, resolveAllowedOrigin } from "@/lib/apiSecurity"

describe("apiSecurity", () => {
  it("normalizes the configured origin allowlist", () => {
    expect(parseAllowedOrigins(" https://one.example,https://two.example/ , ,invalid, https://one.example "))
      .toEqual(["https://one.example", "https://two.example"])
  })

  it("accepts same-origin or server-side requests without an origin header", () => {
    expect(resolveAllowedOrigin(null, ["https://one.example"])).toBeNull()
  })

  it("returns the exact origin when it is allowlisted", () => {
    expect(resolveAllowedOrigin("https://one.example", ["https://one.example"])).toBe("https://one.example")
  })

  it("rejects origins outside the configured allowlist", () => {
    expect(resolveAllowedOrigin("https://two.example", ["https://one.example"])).toBe(false)
  })

  it("blocks requests after the configured limit and resets after the window", () => {
    let now = 1_000
    const limiter = new MemoryRateLimiter({
      limit: 1,
      windowMs: 10_000,
      now: () => now,
    })

    expect(limiter.consume("user-1")).toEqual({ allowed: true, retryAfterSeconds: 0 })
    expect(limiter.consume("user-1")).toEqual({ allowed: false, retryAfterSeconds: 10 })

    now += 10_001

    expect(limiter.consume("user-1")).toEqual({ allowed: true, retryAfterSeconds: 0 })
  })
})
