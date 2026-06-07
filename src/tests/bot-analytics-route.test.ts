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
  },
}))

vi.mock("@/model/ChatSession", () => ({
  default: {
    aggregate: vi.fn(),
  },
}))

import { getSession } from "@/lib/getSession"
import ChatSession from "@/model/ChatSession"
import Bot from "@/model/Bot"

describe("/api/bots/[botId]/analytics route", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
  })

  it("returns aggregate session and message counts for the owner bot", async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "owner_1" },
    } as never)
    vi.mocked(Bot.findOne).mockResolvedValue({ _id: "bot_1", ownerId: "owner_1" } as never)
    vi.mocked(ChatSession.aggregate).mockResolvedValue([
      {
        totals: [{ _id: null, totalSessions: 4, totalMessages: 12 }],
        last7Days: [{ _id: "2026-06-01", sessions: 2, messages: 3 }],
      },
    ] as never)

    const { GET } = await import("@/app/api/bots/[botId]/analytics/route")
    const req = new NextRequest("http://localhost/api/bots/bot_1/analytics")
    const response = await GET(req, { params: Promise.resolve({ botId: "bot_1" }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.totalSessions).toBe(4)
    expect(payload.totalMessages).toBe(12)
    expect(payload.last7Days).toHaveLength(1)
  })
})
