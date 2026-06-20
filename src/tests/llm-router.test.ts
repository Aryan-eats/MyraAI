import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const genAiMock = vi.hoisted(() => ({
  generateContent: vi.fn(),
}))

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return {
      models: {
        generateContent: genAiMock.generateContent,
      },
    }
  }),
}))

describe("llm router", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    genAiMock.generateContent.mockReset()
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

  it("uses Gemini 2.5 Flash as the default text provider", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key")
    genAiMock.generateContent.mockResolvedValue({ text: "Gemini direct" })

    const { generateText, hasConfiguredLlmProvider } = await import("@/lib/llm/router")
    const result = await generateText({
      systemInstruction: "Answer precisely.",
      message: "Write a concise reply.",
      temperature: 0.2,
    })

    expect(hasConfiguredLlmProvider()).toBe(true)
    expect(result).toBe("Gemini direct")
    expect(genAiMock.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-flash",
      }),
    )
  })

  it("falls back to OpenRouter by default when Gemini fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key")
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key")
    genAiMock.generateContent.mockRejectedValue(new Error("gemini unavailable"))

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "OpenRouter direct" } }],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const { generateText } = await import("@/lib/llm/router")
    const result = await generateText({
      systemInstruction: "Answer precisely.",
      message: "Write a concise reply.",
      temperature: 0.2,
    })

    expect(result).toBe("OpenRouter direct")
    expect(genAiMock.generateContent).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer openrouter-test-key",
        }),
        body: expect.stringContaining('"model":"meta-llama/llama-3.3-70b-instruct:free"'),
      }),
    )
  })

  it("does not use Claude from the default provider order", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key")
    vi.stubEnv("CLAUDE_API_KEY", "claude-test-key")

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "rate limited",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "Claude fallback" }],
        }),
      })
    vi.stubGlobal("fetch", fetchMock)

    const { generateText } = await import("@/lib/llm/router")
    await expect(generateText({ message: "Say hello" })).rejects.toThrow("All configured LLM providers failed")

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
