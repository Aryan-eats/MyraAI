vi.mock("@/lib/pgClient", () => ({ hasPostgres: vi.fn(() => true) }))
vi.mock("@/lib/loanDb", () => ({
  getBankByCode: vi.fn(),
  getBankProduct: vi.fn(),
  getLoanProductsByType: vi.fn(),
}))

import { answerLoanQuestion } from "@/lib/loanAnswering"
import { getBankProduct, getLoanProductsByType } from "@/lib/loanDb"

const mockGetBankProduct = vi.mocked(getBankProduct)
const mockGetLoanProductsByType = vi.mocked(getLoanProductsByType)

const sampleBank = {
  id: "b1",
  name: "HDFC Bank",
  code: "HDFC",
  interestRateMin: 8.5,
  interestRateMax: 9.6,
  processingFee: "0.5%",
  processingTime: "3-10 days",
  avgTat: 7,
  minAmount: 500000,
  maxAmount: 100000000,
  maxTenure: 360,
  supportedLoanTypes: ["home_loan"],
  features: ["fast processing"],
  isPopular: true,
  approvalRate: 80,
}

describe("answerLoanQuestion", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.clearAllMocks()
    delete process.env.FIRECRAWL_API_KEY
  })

  it("returns PostgreSQL product data without calling Firecrawl", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test"
    global.fetch = vi.fn()
    mockGetBankProduct.mockResolvedValueOnce(sampleBank)

    const result = await answerLoanQuestion({
      query: "HDFC home loan rate",
      bankCode: "HDFC",
      loanType: "home loan",
    })

    expect(result.source).toBe("postgres")
    expect(result.marking).toBe("Source: GPS India database")
    expect(result.data).toMatchObject({ bankFound: true, offersType: true })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("falls back to Firecrawl and marks the answer when PostgreSQL has no products", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test"
    mockGetLoanProductsByType.mockResolvedValueOnce([])
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          web: [
            {
              title: "RBI loan guidance",
              url: "https://example.com/rbi-loans",
              description: "Loan rules",
              markdown: "Borrowers should compare rates and fees before applying.",
            },
          ],
        },
      }),
    } as never)

    const result = await answerLoanQuestion({
      query: "latest education loan rules",
      loanType: "education loan",
    })

    expect(result.source).toBe("web_search")
    expect(result.marking).toBe("Source: Web search via Firecrawl")
    expect(result.data).toMatchObject({
      query: "latest education loan rules",
      results: [{ title: "RBI loan guidance", url: "https://example.com/rbi-loans" }],
    })
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.firecrawl.dev/v2/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer fc-test" }),
      }),
    )
  })
})
