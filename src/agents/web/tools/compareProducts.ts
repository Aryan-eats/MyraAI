import { hasPostgres } from "@/lib/pgClient"
import { getLoanProductsByType } from "@/lib/loanDb"
import { normalizeLoanType } from "@/lib/loanTypes"
import { searchLendingKnowledge } from "@/lib/knowledgeBase"

type BackendOffer = {
  name?: string
  bankName?: string
  interestRateMin?: number
  interestRateMax?: number
  processingFee?: string
  processingTime?: string
  avgTat?: string
  minAmount?: number
  maxAmount?: number
  maxTenure?: number
  estimatedEmi?: number
  matchedLoanTypes?: string[]
}

async function compareWithBackend(params: { loanType: string; amount?: number }) {
  const apiBaseUrl = process.env.GPS_INDIA_API_URL?.replace(/\/$/, "")
  if (!apiBaseUrl || !params.loanType) {
    return null
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/leads/match-offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loanType: params.loanType,
        ...(typeof params.amount === "number" ? { loanAmount: params.amount } : {}),
      }),
      cache: "no-store",
    })

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as {
      data?: { resolvedLoanTypes?: string[]; offers?: BackendOffer[] }
    }
    const offers = payload.data?.offers ?? []
    if (!offers.length) {
      return null
    }

    return {
      source: "backend" as const,
      loanType: params.loanType,
      resolvedLoanTypes: payload.data?.resolvedLoanTypes ?? [],
      count: offers.length,
      comparison: offers.slice(0, 8).map((offer) => ({
        bankName: offer.name ?? offer.bankName ?? "Lender",
        rateRange:
          typeof offer.interestRateMin === "number" && typeof offer.interestRateMax === "number"
            ? `${offer.interestRateMin}-${offer.interestRateMax}%`
            : "Contact lender",
        processingFee: offer.processingFee,
        processingTime: offer.processingTime,
        avgTat: offer.avgTat,
        minAmount: offer.minAmount,
        maxAmount: offer.maxAmount,
        maxTenure: offer.maxTenure,
        estimatedEmi: offer.estimatedEmi,
        matchedLoanTypes: offer.matchedLoanTypes,
      })),
    }
  } catch {
    return null
  }
}

/**
 * Compare lenders for a loan type, cheapest rate first.
 *
 * Primary path reads the live `banks` table. Returns a structured comparison
 * array for the model to render; does not emit markdown itself.
 */
export async function compareProducts(params: { loanType?: string; productType?: string; amount?: number }) {
  const loanType = normalizeLoanType(params.loanType ?? params.productType ?? "")

  const backendResult = await compareWithBackend({ loanType, amount: params.amount })
  if (backendResult) {
    return backendResult
  }

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
