import { hasPostgres } from "@/lib/pgClient"
import { getLoanProductsByType } from "@/lib/loanDb"
import { normalizeLoanType } from "@/lib/loanTypes"
import { searchLendingKnowledge } from "@/lib/knowledgeBase"

/**
 * Compare lenders for a loan type, cheapest rate first.
 *
 * Primary path reads the live `banks` table. Returns a structured comparison
 * array for the model to render; does not emit markdown itself.
 */
export async function compareProducts(params: { loanType?: string; productType?: string; amount?: number }) {
  const loanType = normalizeLoanType(params.loanType ?? params.productType ?? "")

  if (hasPostgres() && loanType) {
    const products = await getLoanProductsByType(loanType)
    const filtered =
      typeof params.amount === "number"
        ? products.filter((p) => params.amount! >= p.minAmount && params.amount! <= p.maxAmount)
        : products
    const list = (filtered.length > 0 ? filtered : products).slice(0, 8)

    return {
      source: "postgres" as const,
      loanType,
      count: list.length,
      comparison: list.map((p) => ({
        bankName: p.name,
        rateRange: `${p.interestRateMin}-${p.interestRateMax}%`,
        processingFee: p.processingFee,
        processingTime: p.processingTime,
        avgTat: p.avgTat,
        minAmount: p.minAmount,
        maxAmount: p.maxAmount,
        approvalRate: p.approvalRate,
      })),
    }
  }

  // Fallback to the MongoDB lending knowledge base.
  const results = await searchLendingKnowledge(`${params.productType ?? params.loanType ?? ""} rates`, {
    productType: (params.productType as never) ?? undefined,
    minLoanAmount: params.amount,
  })

  return {
    source: "mongo" as const,
    comparison: results
      .sort((a, b) => a.interestRateMin - b.interestRateMin)
      .slice(0, 5)
      .map((item) => ({
        bankName: item.lenderName,
        rateRange: `${item.interestRateMin}-${item.interestRateMax}%`,
        processingFee: `${item.processingFeePercent}%`,
        tatDays: item.tatDays,
        minCibilScore: item.minCibilScore,
        confidence: item.confidence,
      })),
  }
}
