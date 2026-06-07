vi.mock("@/lib/gemini", () => ({
  generateWithTools: vi.fn(),
}))

vi.mock("@/agents/web/tools/searchKnowledge", () => ({ searchKnowledge: vi.fn() }))
vi.mock("@/agents/web/tools/checkEligibility", () => ({ checkEligibility: vi.fn() }))
vi.mock("@/agents/web/tools/compareProducts", () => ({ compareProducts: vi.fn() }))
vi.mock("@/agents/web/tools/captureLead", () => ({ captureLead: vi.fn() }))

import { runWebAgent } from "@/agents/web/agent"
import { generateWithTools } from "@/lib/gemini"

const mockGenerate = vi.mocked(generateWithTools)

describe("runWebAgent", () => {
  it("returns fallback text when model call fails", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("gemini down"))

    const result = await runWebAgent("hello", [])

    expect(result.toolsUsed).toEqual([])
    expect(result.text.length).toBeGreaterThan(10)
  })

  it("returns direct text when no tool call is requested", async () => {
    mockGenerate.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: "Rates are subject to eligibility." }] } }],
    } as never)

    const result = await runWebAgent("tell rates", [])
    expect(result.text).toContain("subject")
  })
})
