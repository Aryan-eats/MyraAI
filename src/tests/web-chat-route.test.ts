import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/agents/web/agent", () => ({
  runWebAgent: vi.fn().mockResolvedValue({ text: "ok", toolsUsed: [] }),
}))

vi.mock("@/lib/llm/router", () => ({
  hasConfiguredLlmProvider: vi.fn().mockReturnValue(true),
}))

vi.mock("@/lib/gemini", () => ({
  loadConversationHistory: vi.fn().mockResolvedValue([]),
  saveConversationHistory: vi.fn().mockResolvedValue(undefined),
  summarizeAndCloseConversation: vi.fn().mockResolvedValue(undefined),
}))

describe("/api/chat/web route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses browser conversation when server history is empty", async () => {
    const { runWebAgent } = await import("@/agents/web/agent")
    const { POST } = await import("@/app/api/chat/web/route")
    const req = new NextRequest("http://localhost/api/chat/web", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "home loan",
        sessionId: "session-1",
        conversation: [
          { role: "assistant", text: "I am Myra, GPS India's lending advisor." },
          { role: "user", text: "documents required from bajaj finserv" },
          { role: "assistant", text: "Which loan type?" },
        ],
      }),
    })

    await POST(req)

    expect(runWebAgent).toHaveBeenCalledWith("home loan", [
      { role: "user", content: "documents required from bajaj finserv" },
      { role: "model", content: "Which loan type?" },
    ])
  })
})
