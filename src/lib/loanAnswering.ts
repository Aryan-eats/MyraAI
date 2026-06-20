import { getBankByCode, getBankProduct, getLoanProductsByType } from "@/lib/loanDb"
import { hasPostgres } from "@/lib/pgClient"
import { loanTypeFromText, normalizeLoanType } from "@/lib/loanTypes"

type LoanQuestionArgs = {
  loanType?: string
  bankCode?: string
  query?: string
}

type FirecrawlResult = {
  title: string | null
  url: string
  description: string | null
  markdown: string
}

export type LoanAnswerSource = "postgres" | "web_search"

export type LoanAnswerResult = {
  source: LoanAnswerSource
  marking: "Source: GPS India database" | "Source: Web search via Firecrawl"
  data: Record<string, unknown>
}

async function searchFirecrawl(query: string): Promise<FirecrawlResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    return []
  }

  const response = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit: 5,
      scrapeOptions: {
        formats: [{ type: "markdown" }],
      },
    }),
  })

  if (!response.ok) {
    return []
  }

  const payload = (await response.json()) as {
    data?: {
      web?: Array<{
        title?: string
        url?: string
        description?: string
        markdown?: string
      }>
    }
  }

  return (payload.data?.web ?? [])
    .filter((item) => typeof item.url === "string" && item.url.length > 0)
    .map((item) => ({
      title: item.title ?? null,
      url: item.url as string,
      description: item.description ?? null,
      markdown: item.markdown ?? "",
    }))
}

async function webFallback(query: string): Promise<LoanAnswerResult> {
  const results = await searchFirecrawl(query)
  return {
    source: "web_search",
    marking: "Source: Web search via Firecrawl",
    data: {
      query,
      results,
      count: results.length,
      note: results.length
        ? "Database had no matching answer; use these Firecrawl results and explicitly mark the answer as web searched."
        : "Database had no matching answer and Firecrawl returned no usable results.",
    },
  }
}

function postgresResult(data: Record<string, unknown>): LoanAnswerResult {
  return {
    source: "postgres",
    marking: "Source: GPS India database",
    data,
  }
}

export async function answerLoanQuestion(args: LoanQuestionArgs | string): Promise<LoanAnswerResult> {
  const normalizedArgs: LoanQuestionArgs = typeof args === "string" ? { query: args } : args
  const query = normalizedArgs.query?.trim() || [normalizedArgs.bankCode, normalizedArgs.loanType].filter(Boolean).join(" ")
  const loanType =
    normalizeLoanType(normalizedArgs.loanType) ||
    loanTypeFromText(query) ||
    ""

  if (!hasPostgres()) {
    return webFallback(query || "bank loan information India")
  }

  if (normalizedArgs.bankCode) {
    const bankCode = normalizedArgs.bankCode.toUpperCase()

    if (loanType) {
      const product = await getBankProduct(bankCode, loanType)
      if (product) {
        return postgresResult({ loanType, bankFound: true, offersType: true, product })
      }

      const bank = await getBankByCode(bankCode)
      if (bank) {
        return postgresResult({
          loanType,
          bankFound: true,
          offersType: false,
          supportedLoanTypes: bank.supportedLoanTypes,
          bankName: bank.name,
        })
      }

      return webFallback(query || `${bankCode} ${loanType}`)
    }

    const bank = await getBankByCode(bankCode)
    if (bank) {
      return postgresResult({ bankFound: true, product: bank })
    }

    return webFallback(query || bankCode)
  }

  if (loanType) {
    const products = await getLoanProductsByType(loanType)
    if (products.length > 0) {
      return postgresResult({ loanType, products, count: products.length })
    }
    return webFallback(query || loanType)
  }

  return webFallback(query || "bank loan information India")
}
