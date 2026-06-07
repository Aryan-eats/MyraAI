import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/chatCache", () => ({
  getCachedResponse: vi.fn().mockResolvedValue(null),
  setCachedResponse: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/gemini", () => ({
  generateText: vi.fn().mockResolvedValue("FAQ answer"),
  generateWithTools: vi.fn(),
}))

vi.mock("@/lib/llm/router", () => ({
  hasConfiguredLlmProvider: vi.fn().mockReturnValue(true),
}))

vi.mock("@/lib/chatAuth", () => ({
  getChatUser: vi.fn().mockResolvedValue({
    authenticated: false,
    userId: "anon-user",
    userRole: "anonymous",
    entityId: null,
    token: null,
  }),
}))

vi.mock("@/lib/escalation", () => ({
  escalateConversation: vi.fn(),
}))

vi.mock("@/lib/geminiTools", () => ({
  GEMINI_TOOL_DECLARATIONS: [],
  INTENT_CLASSIFIER_PROMPT: "prompt",
  isToolName: vi.fn().mockReturnValue(false),
  toIntentSlug: vi.fn().mockReturnValue("general-faq"),
  ttlForIntent: vi.fn().mockReturnValue(60),
}))

vi.mock("@/lib/gpsBridge", () => ({
  getCommissionStatus: vi.fn(),
  getDocumentChecklist: vi.fn(),
  getEmiSchedule: vi.fn(),
  getLeadPipeline: vi.fn(),
  getLoanStatus: vi.fn(),
  GpsBridgeError: class GpsBridgeError extends Error {
    status?: number
    code?: string
  },
}))

vi.mock("@/lib/intentRules", () => ({
  classifyByRules: vi.fn().mockReturnValue({
    intent: "general_faq",
    toolName: null,
    confidence: 1,
    params: {},
  }),
}))

vi.mock("@/model/knowledge.model", () => ({
  default: {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}))

vi.mock("@/model/settings.model", () => ({
  default: {
    findOne: vi.fn().mockResolvedValue(null),
  },
}))

describe("/api/chat route", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.stubEnv("CHAT_ALLOWED_ORIGINS", "https://allowed.example")
    vi.stubEnv("CHAT_RATE_LIMIT_MAX", "1")
    vi.stubEnv("CHAT_RATE_LIMIT_WINDOW_MS", "60000")
  })

  it("rejects requests from disallowed origins", async () => {
    const { POST } = await import("@/app/api/chat/route")
    const req = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: {
        origin: "https://blocked.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "What is my status?" }),
    })

    const response = await POST(req)
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.message).toMatch(/origin/i)
  })

  it("allows configured origins and returns a matching CORS header", async () => {
    const { POST } = await import("@/app/api/chat/route")
    const req = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: {
        origin: "https://allowed.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "What is my status?" }),
    })

    const response = await POST(req)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.answer).toBe("FAQ answer")
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://allowed.example")
  })

  it("rate limits repeated requests from the same client", async () => {
    const { POST } = await import("@/app/api/chat/route")
    const first = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: {
        origin: "https://allowed.example",
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.10",
      },
      body: JSON.stringify({ message: "What is my status?" }),
    })
    const second = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: {
        origin: "https://allowed.example",
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.10",
      },
      body: JSON.stringify({ message: "What is my status?" }),
    })

    const firstResponse = await POST(first)
    const secondResponse = await POST(second)
    const payload = await secondResponse.json()

    expect(firstResponse.status).toBe(200)
    expect(secondResponse.status).toBe(429)
    expect(payload.message).toMatch(/rate limit/i)
    expect(secondResponse.headers.get("Retry-After")).toBe("60")
  })
})
