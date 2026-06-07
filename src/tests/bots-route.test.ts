import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/getSession", () => ({
  getSession: vi.fn(),
}))

vi.mock("@/model/Bot", () => ({
  default: {
    find: vi.fn(),
    create: vi.fn(),
  },
}))

import { getSession } from "@/lib/getSession"
import Bot from "@/model/Bot"

describe("/api/bots route", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
  })

  it("lists bots for the signed-in owner", async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "owner_1" },
    } as never)
    vi.mocked(Bot.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ name: "Bot A" }, { name: "Bot B" }]),
      }),
    } as never)

    const { GET } = await import("@/app/api/bots/route")
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(Bot.find).toHaveBeenCalledWith({ ownerId: "owner_1" })
    expect(payload.bots).toHaveLength(2)
  })

  it("creates a bot for the signed-in owner", async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "owner_1" },
    } as never)
    vi.mocked(Bot.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    } as never)
    vi.mocked(Bot.create).mockResolvedValue({
      _id: "bot_1",
      ownerId: "owner_1",
      name: "Acme Support",
      slug: "acme-support",
      systemPrompt: "Helpful",
      primaryColor: "#112233",
      welcomeMessage: "Hello",
      fallbackMessage: "Fallback",
      allowedDomains: [],
      status: "active",
    } as never)

    const { POST } = await import("@/app/api/bots/route")
    const req = new NextRequest("http://localhost/api/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Acme Support",
        systemPrompt: "Helpful",
        primaryColor: "#112233",
        welcomeMessage: "Hello",
        fallbackMessage: "Fallback",
        allowedDomains: ["https://example.com"],
      }),
    })

    const response = await POST(req)
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(Bot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner_1",
        name: "Acme Support",
        slug: "acme-support",
      }),
    )
    expect(payload.bot.slug).toBe("acme-support")
  })
})
