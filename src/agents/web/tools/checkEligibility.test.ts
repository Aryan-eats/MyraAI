import { checkEligibility } from "@/agents/web/tools/checkEligibility"

describe("checkEligibility", () => {
  it("calculates FOIR and returns strong band", async () => {
    const result = await checkEligibility({
      monthlyIncome: 100000,
      monthlyObligations: 20000,
      proposedEmi: 10000,
    })

    expect(result.foirCurrent).toBe(0.2)
    expect(result.foirProjected).toBe(0.3)
    expect(result.indicativeBand).toBe("strong")
  })

  it("handles zero income safely", async () => {
    const result = await checkEligibility({
      monthlyIncome: 0,
      monthlyObligations: 0,
      proposedEmi: 0,
    })

    expect(result.foirCurrent).toBe(1)
    expect(result.foirProjected).toBe(1)
    expect(result.indicativeBand).toBe("stretch")
  })
})
