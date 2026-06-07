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
  generateText: vi.fn().mockResolvedValue("RAG answer"),
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

vi.mock("@/lib/retrieval", () => ({
  retrieveRelevantChunks: vi.fn().mockResolvedValue(["knowledge chunk"]),
}))

vi.mock("@/model/Bot", () => ({
  default: {
    findById: vi.fn(),
  },
}))

vi.mock("@/model/ChatSession", () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
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

import Bot from "@/model/Bot"
import ChatSession from "@/model/ChatSession"

describe("/api/chat phase 3", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.stubEnv("CHAT_ALLOWED_ORIGINS", "https://allowed.example")
    vi.stubEnv("CHAT_RATE_LIMIT_MAX", "1")
    vi.stubEnv("CHAT_RATE_LIMIT_WINDOW_MS", "60000")
  })

  it("uses bot knowledge and persists session state", async () => {
    vi.mocked(Bot.findById).mockResolvedValue({
      _id: "bot_1",
      ownerId: "user_1",
      name: "Acme Support",
      slug: "acme-support",
      systemPrompt: "Be helpful",
      primaryColor: "#123456",
      welcomeMessage: "Hello",
      fallbackMessage: "Fallback",
      allowedDomains: [],
      status: "active",
    } as never)

    vi.mocked(ChatSession.findOne).mockResolvedValue(null)
    vi.mocked(ChatSession.create).mockImplementation(async (payload: Record<string, unknown>) => ({
      messages: [],
      save: vi.fn().mockResolvedValue(undefined),
      ...payload,
    } as never))

    const { POST } = await import("@/app/api/chat/route")
    const req = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: {
        origin: "https://allowed.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        botId: "bot_1",
        message: "What can you help with?",
        sessionId: "session_1",
      }),
    })

    const response = await POST(req)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.reply).toBe("RAG answer")
    expect(payload.sessionId).toBe("session_1")
  })
})
