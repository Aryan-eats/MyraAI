vi.mock("@/lib/pgClient", () => ({ hasPostgres: vi.fn(() => true) }))
vi.mock("@/lib/loanDb", () => ({
  getBankProduct: vi.fn(),
  getBankByCode: vi.fn(),
  getLoanProductsByType: vi.fn(),
  getDocumentRequirements: vi.fn(),
}))
vi.mock("@/lib/knowledgeBase", () => ({ searchLendingKnowledge: vi.fn() }))

import { calculateEmi } from "@/agents/web/tools/calculateEmi"
import { searchKnowledge } from "@/agents/web/tools/searchKnowledge"
import { compareProducts } from "@/agents/web/tools/compareProducts"
import { getDocuments } from "@/agents/web/tools/getDocuments"
import { getBankProduct, getBankByCode, getLoanProductsByType, getDocumentRequirements } from "@/lib/loanDb"

const mockGetBankProduct = vi.mocked(getBankProduct)
const mockGetBankByCode = vi.mocked(getBankByCode)
const mockGetLoanProductsByType = vi.mocked(getLoanProductsByType)
const mockGetDocumentRequirements = vi.mocked(getDocumentRequirements)

const sampleBank = {
  id: "b1",
  name: "HDFC Bank",
  code: "HDFC",
  interestRateMin: 8.5,
  interestRateMax: 14,
  processingFee: "0.5% - 2%",
  processingTime: "3-10 days",
  avgTat: 4,
  minAmount: 500000,
  maxAmount: 100000000,
  maxTenure: 360,
  supportedLoanTypes: ["home_loan", "personal_loan"],
  features: [],
  isPopular: true,
  approvalRate: 80,
}

describe("calculateEmi", () => {
  it("returns the exact EMI for 20L at 9% over 240 months", () => {
    const result = calculateEmi({ principalAmount: 2000000, annualInterestRate: 9, tenureMonths: 240 })
    expect(result).toMatchObject({ monthlyEmi: 17995 })
  })

  it("handles a zero interest rate", () => {
    const result = calculateEmi({ principalAmount: 120000, annualInterestRate: 0, tenureMonths: 12 })
    expect(result).toMatchObject({ monthlyEmi: 10000, totalInterest: 0 })
  })

  it("rejects invalid inputs", () => {
    const result = calculateEmi({ principalAmount: 0, annualInterestRate: 9, tenureMonths: 240 })
    expect(result).toHaveProperty("error")
  })
})

describe("searchKnowledge (postgres)", () => {
  it("maps a bank + loan type query to getBankProduct", async () => {
    mockGetBankProduct.mockResolvedValueOnce(sampleBank)

    const result = await searchKnowledge({ bankCode: "HDFC", loanType: "home loan", query: "hdfc home loan rate" })

    expect(mockGetBankProduct).toHaveBeenCalledWith("HDFC", "home_loan")
    expect(result).toMatchObject({ bankFound: true, offersType: true })
  })

  it("reports when a bank does not offer the requested loan type", async () => {
    mockGetBankProduct.mockResolvedValueOnce(null)
    mockGetBankByCode.mockResolvedValueOnce({ ...sampleBank, supportedLoanTypes: ["personal_loan"] })

    const result = await searchKnowledge({ bankCode: "HDFC", loanType: "gold loan", query: "hdfc gold loan" })

    expect(result).toMatchObject({ bankFound: true, offersType: false })
  })

  it("lists all banks for a loan type when no bank is named", async () => {
    mockGetLoanProductsByType.mockResolvedValueOnce([sampleBank])

    const result = await searchKnowledge({ loanType: "home_loan", query: "home loan options" })

    expect(mockGetLoanProductsByType).toHaveBeenCalledWith("home_loan")
    expect(result).toMatchObject({ count: 1 })
  })
})

describe("compareProducts (postgres)", () => {
  it("returns a comparison array for the loan type", async () => {
    mockGetLoanProductsByType.mockResolvedValueOnce([
      sampleBank,
      { ...sampleBank, name: "SBI", code: "SBI", interestRateMin: 8.25 },
    ])

    const result = await compareProducts({ loanType: "home_loan" })

    expect(result.source).toBe("postgres")
    expect(result.comparison).toHaveLength(2)
    expect(result.comparison[0]).toHaveProperty("rateRange")
  })
})

describe("getDocuments", () => {
  it("splits mandatory and optional documents", async () => {
    mockGetDocumentRequirements.mockResolvedValueOnce([
      { docId: "aadhaar", docName: "Aadhaar Card", description: null, mandatory: true, acceptedFormats: [], maxSizeMb: 5 },
      { docId: "offer", docName: "Employment Letter", description: null, mandatory: false, acceptedFormats: [], maxSizeMb: 5 },
    ])

    const result = await getDocuments({ bankCode: "HDFC", loanType: "home_loan" })

    expect(result).toMatchObject({
      available: true,
      mandatoryDocs: ["Aadhaar Card"],
      optionalDocs: ["Employment Letter"],
    })
  })

  it("reports when no checklist exists but the bank is known", async () => {
    mockGetDocumentRequirements.mockResolvedValueOnce([])
    mockGetBankByCode.mockResolvedValueOnce({ ...sampleBank, supportedLoanTypes: ["personal_loan"] })

    const result = await getDocuments({ bankCode: "HDFC", loanType: "gold_loan" })

    expect(result).toMatchObject({ available: false, bankFound: true })
  })
})
