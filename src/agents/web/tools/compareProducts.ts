import { searchLendingKnowledge } from "@/lib/knowledgeBase"

export async function compareProducts(params: {
  productType: "personal_loan" | "home_loan" | "lap" | "business_loan" | "vehicle_loan" | "education_loan"
  amount?: number
}) {
  const results = await searchLendingKnowledge(`${params.productType} rates`, {
    productType: params.productType,
    minLoanAmount: params.amount,
  })

  return results
    .sort((a, b) => a.interestRateMin - b.interestRateMin)
    .slice(0, 5)
    .map((item) => ({
      lenderName: item.lenderName,
      rateRange: `${item.interestRateMin}-${item.interestRateMax}%`,
      processingFee: `${item.processingFeePercent}%`,
      tatDays: item.tatDays,
      minCibilScore: item.minCibilScore,
      confidence: item.confidence,
    }))
}
