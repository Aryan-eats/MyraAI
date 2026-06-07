vi.mock("@/lib/gpsBridge", () => ({
  fetchPartnerLeadProfile: vi.fn(),
  appendLeadPartnerNote: vi.fn(),
}))

vi.mock("@/lib/knowledgeBase", () => ({
  searchLendingKnowledge: vi.fn(),
}))

import { runSoftCheck } from "@/lib/softCheckEngine"
import { appendLeadPartnerNote, fetchPartnerLeadProfile } from "@/lib/gpsBridge"
import { searchLendingKnowledge } from "@/lib/knowledgeBase"

const mockLeadProfile = vi.mocked(fetchPartnerLeadProfile)
const mockAppendNote = vi.mocked(appendLeadPartnerNote)
const mockSearch = vi.mocked(searchLendingKnowledge)

describe("runSoftCheck", () => {
  it("flags hard disqualifier for low cibil", async () => {
    mockLeadProfile.mockResolvedValue({
      leadId: "L1",
      partnerId: "P1",
      applicantName: "Rahul",
      phone: "9999999999",
      age: 30,
      employmentType: "salaried",
      monthlyIncome: 80000,
      monthlyObligations: 15000,
      cibilScore: 580,
      hasNpaFlag: false,
      duplicateWithin90Days: false,
      productType: "personal_loan",
      requestedLoanAmount: 500000,
      proposedEmi: 12000,
    })

    mockSearch.mockResolvedValue([
      {
        lenderName: "HDFC Bank",
        minCibilScore: 700,
        minMonthlyIncome: 25000,
        minLoanAmount: 100000,
        maxLoanAmount: 3000000,
        confidence: 0.8,
      },
    ] as never)

    const result = await runSoftCheck("L1", "P1", { token: "tok" })

    expect(result.hardDisqualifier).toContain("CIBIL")
    expect(result.viable).toBe(false)
    expect(result.confidence).toBe("low")
    expect(mockAppendNote).toHaveBeenCalledOnce()
  })

  it("calculates ltv for secured loans", async () => {
    mockLeadProfile.mockResolvedValue({
      leadId: "L2",
      partnerId: "P1",
      applicantName: "Priya",
      phone: "9999999998",
      age: 36,
      employmentType: "self_employed",
      monthlyIncome: 150000,
      monthlyObligations: 30000,
      cibilScore: 740,
      hasNpaFlag: false,
      duplicateWithin90Days: false,
      productType: "home_loan",
      requestedLoanAmount: 6000000,
      proposedEmi: 35000,
      propertyValue: 8000000,
    })

    mockSearch.mockResolvedValue([
      {
        lenderName: "Axis Bank",
        minCibilScore: 700,
        minMonthlyIncome: 50000,
        minLoanAmount: 1000000,
        maxLoanAmount: 10000000,
        confidence: 0.9,
      },
    ] as never)

    const result = await runSoftCheck("L2", "P1", { token: "tok" })

    expect(result.ltv?.ratio).toBeCloseTo(0.75)
    expect(result.ltv?.status).toBe("within_limit")
    expect(result.foir.risk).toBe("low")
  })
})
