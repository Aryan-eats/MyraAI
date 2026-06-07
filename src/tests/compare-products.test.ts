vi.mock("@/lib/knowledgeBase", () => ({
  searchLendingKnowledge: vi.fn(),
}))

import { compareProducts } from "@/agents/web/tools/compareProducts"
import { searchLendingKnowledge } from "@/lib/knowledgeBase"

const mockedSearch = vi.mocked(searchLendingKnowledge)

describe("compareProducts", () => {
  it("sorts products by minimum rate and maps summary fields", async () => {
    mockedSearch.mockResolvedValue([
      {
        lenderName: "Bank B",
        interestRateMin: 11.5,
        interestRateMax: 18,
        processingFeePercent: 2,
        tatDays: 4,
        minCibilScore: 700,
        confidence: 0.8,
      },
      {
        lenderName: "Bank A",
        interestRateMin: 10.5,
        interestRateMax: 17,
        processingFeePercent: 1.5,
        tatDays: 3,
        minCibilScore: 680,
        confidence: 0.85,
      },
    ] as never)

    const result = await compareProducts({ productType: "personal_loan", amount: 500000 })

    expect(result[0].lenderName).toBe("Bank A")
    expect(result[0].rateRange).toBe("10.5-17%")
    expect(result[1].lenderName).toBe("Bank B")
  })
})
