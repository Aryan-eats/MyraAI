import { describe, expect, it } from "vitest"
import { chunkText } from "@/lib/chunker"

describe("chunkText", () => {
  it("normalizes whitespace and creates overlapping chunks", () => {
    const chunks = chunkText(
      "Alpha   beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega",
      40,
      10,
    )

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0]).toContain("Alpha beta gamma")
    expect(chunks.every((chunk) => chunk.length > 20)).toBe(true)
    expect(chunks.join(" ")).not.toContain("  ")
  })

  it("drops tiny chunks", () => {
    const chunks = chunkText("too short", 50, 10)

    expect(chunks).toEqual([])
  })
})
