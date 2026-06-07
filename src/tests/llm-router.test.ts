import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(() => ({
    models: {
      generateContent: vi.fn(),
    },
  })),
}))

describe("llm router", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("treats Claude as a configured provider", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "claude-test-key")
    vi.stubEnv("LLM_PROVIDER_ORDER", "claude")

    const { hasConfiguredLlmProvider } = await import("@/lib/llm/router")

    expect(hasConfiguredLlmProvider()).toBe(true)
  })

  it("falls back to Claude text generation when Claude is the only provider", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "claude-test-key")
    vi.stubEnv("LLM_PROVIDER_ORDER", "claude")

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Claude response" }],
      }),
    })

    vi.stubGlobal("fetch", fetchMock)

    const { generateText } = await import("@/lib/llm/router")
    const result = await generateText({ message: "Say hello", temperature: 0 })

    expect(result).toBe("Claude response")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "claude-test-key",
        }),
      }),
    )
  })

  it("uses ensemble synthesis for text generation when enabled", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key")
    vi.stubEnv("CLAUDE_API_KEY", "claude-test-key")
    vi.stubEnv("LLM_PROVIDER_ORDER", "openai,claude")
    vi.stubEnv("LLM_ORCHESTRATION_MODE", "ensemble")
    vi.stubEnv("LLM_SYNTHESIS_PROVIDER", "claude")

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}

      if (url.includes("openai.com")) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "OpenAI draft" } }],
          }),
        }
      }

      const messages = Array.isArray(body.messages) ? (body.messages as Array<Record<string, unknown>>) : []
      const firstMessage = messages[0] as Record<string, unknown> | undefined
      const contentBlocks = Array.isArray(firstMessage?.content) ? (firstMessage.content as Array<Record<string, unknown>>) : []
      const promptText = typeof contentBlocks[0]?.text === "string" ? contentBlocks[0].text : ""
      const text = promptText.includes("Candidate drafts:") ? "Aligned final" : "Claude draft"

      return {
        ok: true,
        json: async () => ({
          content: [{ type: "text", text }],
        }),
      }
    })

    vi.stubGlobal("fetch", fetchMock)

    const { generateText } = await import("@/lib/llm/router")
    const result = await generateText({
      systemInstruction: "Answer precisely.",
      message: "Write a concise reply.",
      temperature: 0.2,
    })

    expect(result).toBe("Aligned final")
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("defaults to single-provider fallback when orchestration mode is unset", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key")
    vi.stubEnv("CLAUDE_API_KEY", "claude-test-key")
    vi.stubEnv("LLM_PROVIDER_ORDER", "openai,claude")

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "OpenAI direct" } }],
      }),
    })

    vi.stubGlobal("fetch", fetchMock)

    const { generateText } = await import("@/lib/llm/router")
    const result = await generateText({
      systemInstruction: "Answer precisely.",
      message: "Write a concise reply.",
      temperature: 0.2,
    })

    expect(result).toBe("OpenAI direct")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
