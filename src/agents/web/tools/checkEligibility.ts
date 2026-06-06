export async function checkEligibility(input: {
  monthlyIncome: number
  monthlyObligations: number
  proposedEmi: number
}) {
  const foirCurrent = input.monthlyIncome > 0 ? input.monthlyObligations / input.monthlyIncome : 1
  const foirProjected =
    input.monthlyIncome > 0 ? (input.monthlyObligations + input.proposedEmi) / input.monthlyIncome : 1

  return {
    foirCurrent: Number(foirCurrent.toFixed(2)),
    foirProjected: Number(foirProjected.toFixed(2)),
    indicativeBand:
      foirProjected <= 0.45 ? "strong" : foirProjected <= 0.55 ? "moderate" : "stretch",
    disclaimer: "Indicative only, subject to lender eligibility and assessment.",
  }
}
