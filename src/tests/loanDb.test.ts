vi.mock("@/lib/pgClient", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  hasPostgres: vi.fn(() => true),
}))

import { query, queryOne } from "@/lib/pgClient"
import { getLoanProductsByType, getBankProduct, getDocumentRequirements } from "@/lib/loanDb"

const mockQuery = vi.mocked(query)
const mockQueryOne = vi.mocked(queryOne)

const bankRow = {
  id: "b1",
  name: "HDFC Bank",
  code: "HDFC",
  interest_rate_min: "8.50",
  interest_rate_max: "14.00",
  processing_fee: "0.5% - 2%",
  processing_time: "3-10 days",
  avg_tat: 4,
  min_amount: "50000",
  max_amount: "4000000",
  max_tenure: 360,
  supported_loan_types: ["home_loan", "personal_loan"],
  features: ["digital KYC"],
  is_popular: true,
  approval_rate: 80,
}

describe("loanDb", () => {
  it("getLoanProductsByType maps numeric strings to numbers and filters by loan type", async () => {
    mockQuery.mockResolvedValueOnce([bankRow] as never)

    const result = await getLoanProductsByType("home_loan")

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("ANY(supported_loan_types)"), ["home_loan"])
    expect(result[0].interestRateMin).toBe(8.5)
    expect(result[0].interestRateMax).toBe(14)
    expect(result[0].minAmount).toBe(50000)
    expect(result[0].supportedLoanTypes).toEqual(["home_loan", "personal_loan"])
  })

  it("getBankProduct uppercases bank code and returns null when not found", async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    const result = await getBankProduct("hdfc", "home_loan")

    expect(mockQueryOne).toHaveBeenCalledWith(expect.any(String), ["HDFC", "home_loan"])
    expect(result).toBeNull()
  })

  it("getDocumentRequirements maps rows and uppercases lender code", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        doc_id: "aadhaar",
        doc_name: "Aadhaar Card",
        description: null,
        mandatory: true,
        accepted_formats: ["pdf", "jpg"],
        max_size_mb: 5,
      },
    ] as never)

    const result = await getDocumentRequirements("hdfc", "home_loan")

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["HDFC", "home_loan"])
    expect(result[0].docName).toBe("Aadhaar Card")
    expect(result[0].acceptedFormats).toEqual(["pdf", "jpg"])
  })
})
