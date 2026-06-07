import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/model/Bot", () => ({
  default: {
    findById: vi.fn(),
  },
}))

import Bot from "@/model/Bot"

describe("/api/bots/[botId]/public route", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
  })

  it("returns public bot fields only", async () => {
    vi.mocked(Bot.findById).mockResolvedValue({
      _id: "bot_1",
      name: "Acme Support",
      welcomeMessage: "Welcome!",
      primaryColor: "#112233",
      systemPrompt: "hidden",
      status: "active",
    } as never)

    const { GET } = await import("@/app/api/bots/[botId]/public/route")
    const req = new NextRequest("http://localhost/api/bots/bot_1/public")
    const response = await GET(req, { params: Promise.resolve({ botId: "bot_1" }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      name: "Acme Support",
      welcomeMessage: "Welcome!",
      primaryColor: "#112233",
    })
  })
})
