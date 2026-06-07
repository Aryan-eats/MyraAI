import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/model/Bot", () => ({
  default: {
    findOne: vi.fn(),
  },
}))

import Bot from "@/model/Bot"
import { needsOnboarding } from "@/lib/onboarding"

describe("needsOnboarding", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("returns true when the owner has no bots", async () => {
    vi.mocked(Bot.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never)

    await expect(needsOnboarding("owner_1")).resolves.toBe(true)
  })

  it("returns false when the owner already has a bot", async () => {
    vi.mocked(Bot.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: "bot_1" }),
    } as never)

    await expect(needsOnboarding("owner_1")).resolves.toBe(false)
  })
})
