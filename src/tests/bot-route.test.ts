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
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    findOneAndDelete: vi.fn(),
  },
}))

vi.mock("@/model/ChatSession", () => ({
  default: {
    deleteMany: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("@/model/KnowledgeSource", () => ({
  default: {
    deleteMany: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("@/model/KnowledgeChunk", () => ({
  default: {
    deleteMany: vi.fn().mockResolvedValue(undefined),
  },
}))

import { getSession } from "@/lib/getSession"
import Bot from "@/model/Bot"

describe("/api/bots/[botId] route", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
  })

  it("updates only the owner bot", async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "owner_1" },
    } as never)
    vi.mocked(Bot.findOne).mockResolvedValue({ _id: "bot_1", ownerId: "owner_1" } as never)
    vi.mocked(Bot.findOneAndUpdate).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: "bot_1",
        ownerId: "owner_1",
        name: "Updated",
        slug: "updated",
        systemPrompt: "Prompt",
        primaryColor: "#123456",
        welcomeMessage: "Hi",
        fallbackMessage: "Fallback",
        allowedDomains: [],
        status: "active",
      }),
    } as never)

    const { PUT } = await import("@/app/api/bots/[botId]/route")
    const req = new NextRequest("http://localhost/api/bots/bot_1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Updated",
        systemPrompt: "Prompt",
        primaryColor: "#123456",
        welcomeMessage: "Hi",
        fallbackMessage: "Fallback",
        allowedDomains: ["https://example.com"],
        status: "active",
      }),
    })

    const response = await PUT(req, { params: Promise.resolve({ botId: "bot_1" }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.bot.name).toBe("Updated")
  })

  it("deletes only the owner bot", async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "owner_1" },
    } as never)
    vi.mocked(Bot.findOne).mockResolvedValue({ _id: "bot_1", ownerId: "owner_1" } as never)
    vi.mocked(Bot.findOneAndDelete).mockResolvedValue({
      _id: "bot_1",
      ownerId: "owner_1",
    } as never)

    const { DELETE } = await import("@/app/api/bots/[botId]/route")
    const req = new NextRequest("http://localhost/api/bots/bot_1", {
      method: "DELETE",
    })

    const response = await DELETE(req, { params: Promise.resolve({ botId: "bot_1" }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
  })
})
