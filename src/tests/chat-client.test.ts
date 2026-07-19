import fs from "node:fs"
import path from "node:path"

const storage = new Map<string, string>()
const assign = vi.fn()

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  storage.clear()
  process.env.NEXT_PUBLIC_LOANAPP_API_URL = "https://api.gpsindia.test/api"
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" })
  vi.stubGlobal("window", { location: { assign } })
})

describe("LoanApp chat client", () => {
  it("persists one opaque anonymous session identifier", async () => {
    const { getAssistantSessionId } = await import("@/lib/loanAppApi")
    expect(getAssistantSessionId()).toBe("11111111-1111-4111-8111-111111111111")
    expect(getAssistantSessionId()).toBe("11111111-1111-4111-8111-111111111111")
    expect(storage.get("assistantSessionId")).toBe("11111111-1111-4111-8111-111111111111")
  })

  it("refreshes chat auth and keeps its access token only in memory", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { accessToken: "chat-access", user: { id: "chat-1", email: "chat@example.com" } },
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { conversationId: "conversation-1", message: "Answer", actions: [] },
      }), { status: 200, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    const api = await import("@/lib/loanAppApi")

    await expect(api.refreshChatAuth()).resolves.toMatchObject({ email: "chat@example.com" })
    await api.sendAssistantMessage("Home loan help")

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.gpsindia.test/api/auth/chat/refresh", expect.objectContaining({
      method: "POST", credentials: "include",
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.gpsindia.test/api/assistant/message", expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: expect.objectContaining({ Authorization: "Bearer chat-access" }),
    }))
    expect([...storage.values()]).not.toContain("chat-access")
  })

  it("lists, loads, and deletes PostgreSQL-backed conversations", async () => {
    storage.set("assistantSessionId", "11111111-1111-4111-8111-111111111111")
    const fetchMock = vi.fn()
      .mockImplementation(async () => new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
    vi.stubGlobal("fetch", fetchMock)
    const api = await import("@/lib/loanAppApi")

    await api.listAssistantConversations()
    await api.loadAssistantConversation("22222222-2222-4222-8222-222222222222")
    await api.deleteAssistantConversation("22222222-2222-4222-8222-222222222222")

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.gpsindia.test/api/assistant/conversations?sessionId=11111111-1111-4111-8111-111111111111",
      "https://api.gpsindia.test/api/assistant/conversations/22222222-2222-4222-8222-222222222222/messages?sessionId=11111111-1111-4111-8111-111111111111",
      "https://api.gpsindia.test/api/assistant/conversations/22222222-2222-4222-8222-222222222222?sessionId=11111111-1111-4111-8111-111111111111",
    ])
  })

  it("starts Google login on LoanApp instead of a local partner flow", async () => {
    const { startGoogleChatLogin } = await import("@/lib/loanAppApi")
    startGoogleChatLogin()
    expect(assign).toHaveBeenCalledWith("https://api.gpsindia.test/api/auth/chat/google")
  })

  it("contains one public chat mode and no pasted-token or dashboard surface", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/components/ChatWorkspace.tsx"), "utf8")
    expect(source).not.toContain("MODE_CONFIG")
    expect(source).not.toContain("Paste GPS")
    expect(source).not.toContain("/dashboard")
    expect(source).not.toContain("/api/chat")
  })

  it("keeps TypeScript aliases aligned with the thin client", () => {
    const config = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "tsconfig.json"), "utf8"))
    expect(config.compilerOptions.baseUrl).toBeUndefined()
    expect(config.compilerOptions.ignoreDeprecations).toBeUndefined()
    expect(config.compilerOptions.paths).toEqual({ "@/*": ["./src/*"] })
  })
})
