vi.mock("@/lib/gemini", () => ({
  generateWithTools: vi.fn(),
}))

vi.mock("@/agents/web/tools/searchKnowledge", () => ({ searchKnowledge: vi.fn() }))
vi.mock("@/agents/web/tools/checkEligibility", () => ({ checkEligibility: vi.fn() }))
vi.mock("@/agents/web/tools/compareProducts", () => ({ compareProducts: vi.fn() }))
vi.mock("@/agents/web/tools/captureLead", () => ({ captureLead: vi.fn() }))

import { runWebAgent } from "@/agents/web/agent"
import { compareProducts } from "@/agents/web/tools/compareProducts"
import { generateWithTools } from "@/lib/gemini"

const mockGenerate = vi.mocked(generateWithTools)
const mockCompareProducts = vi.mocked(compareProducts)

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

  it("returns tool data instead of generic fallback when final formatting fails", async () => {
    mockGenerate
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "compare_products", args: { loanType: "business_loan", amount: 5000000 } } }],
            },
          },
        ],
      } as never)
      .mockRejectedValueOnce(new Error("final model failed"))
    mockCompareProducts.mockResolvedValueOnce({
      source: "postgres",
      loanType: "business_loan",
      count: 1,
      comparison: [
        {
          bankName: "HDFC Bank",
          rateRange: "10.5-18%",
          processingFee: "1%",
          processingTime: "3 days",
          avgTat: 3,
          minAmount: 100000,
          maxAmount: 10000000,
          approvalRate: 72,
        },
      ],
    })

    const result = await runWebAgent("business loan, 50 lakh", [])

    expect(result.toolsUsed).toEqual(["compare_products"])
    expect(result.text).toContain("HDFC Bank")
    expect(result.text).not.toContain("Please share your loan type")
  })

  it("adds a Hindi response hint for Devanagari messages", async () => {
    mockGenerate.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: "होम लोन के documents..." }] } }],
    } as never)

    await runWebAgent("होम लोन के लिए कौन से documents चाहिए?", [])

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining("Preferred response language: Hindi"),
      }),
    )
  })

  it("adds a Hinglish response hint for Roman Hindi messages", async () => {
    mockGenerate.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: "Aap business loan compare kar sakte hain." }] } }],
    } as never)

    await runWebAgent("mujhe 50 lakh ka business loan chahiye", [])

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining("Preferred response language: Hinglish"),
      }),
    )
  })

  it("switches back to English when the current message is English after Hindi history", async () => {
    mockGenerate.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: "FOIR affects eligibility." }] } }],
    } as never)

    await runWebAgent("How does FOIR affect eligibility?", [
      { role: "user", content: "होम लोन के लिए ऑफर्स बताओ" },
      { role: "model", content: "यहाँ कुछ होम लोन ऑफर्स हैं।" },
    ])

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining("Preferred response language: English"),
      }),
    )
  })

  it("uses Hinglish for Roman Hindi even after Hindi history", async () => {
    mockGenerate.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: "Home loan ke best offers..." }] } }],
    } as never)

    await runWebAgent("sabse ache offers", [{ role: "model", content: "आपको किस तरह का लोन चाहिए?" }])

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining("Preferred response language: Hinglish"),
      }),
    )
  })
})
