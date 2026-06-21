vi.mock("@/lib/knowledgeBase", () => ({
  searchLendingKnowledge: vi.fn(),
}))
vi.mock("@/lib/pgClient", () => ({ hasPostgres: vi.fn(() => false) }))

import { compareProducts } from "@/agents/web/tools/compareProducts"
import { searchLendingKnowledge } from "@/lib/knowledgeBase"

const mockedSearch = vi.mocked(searchLendingKnowledge)

describe("compareProducts", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.GPS_INDIA_API_URL
  })

  it("uses backend match-offers when the GPS backend is configured", async () => {
    process.env.GPS_INDIA_API_URL = "http://localhost:5000"
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          resolvedLoanTypes: ["business_loan"],
          offers: [
            {
              name: "HDFC Bank",
              interestRateMin: 10.5,
              interestRateMax: 18,
              processingFee: "1%",
              processingTime: "3 days",
              minAmount: 100000,
              maxAmount: 10000000,
            },
          ],
        },
      }),
    } as never)

    const result = await compareProducts({ loanType: "business_loan", amount: 5000000 })

    expect(global.fetch).toHaveBeenCalledWith("http://localhost:5000/api/leads/match-offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loanType: "business_loan", loanAmount: 5000000 }),
      cache: "no-store",
    })
    expect(result).toMatchObject({
      source: "backend",
      loanType: "business_loan",
      comparison: [{ bankName: "HDFC Bank", rateRange: "10.5-18%" }],
    })
  })

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

    // With no DATABASE_URL configured this exercises the MongoDB fallback path.
    expect(result.source).toBe("mongo")
    expect(result.comparison[0].bankName).toBe("Bank A")
    expect(result.comparison[0].rateRange).toBe("10.5-17%")
    expect(result.comparison[1].bankName).toBe("Bank B")
  })
})
