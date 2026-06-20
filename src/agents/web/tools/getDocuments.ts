import { getBankByCode, getDocumentRequirements } from "@/lib/loanDb"
import { normalizeLoanType } from "@/lib/loanTypes"
import { hasPostgres } from "@/lib/pgClient"

/**
 * Returns the official document checklist for a lender + loan type from the live
 * `lender_doc_requirements` table.
 */
export async function getDocuments(args: { bankCode: string; loanType: string }) {
  if (!hasPostgres()) {
    return { available: false, reason: "Document database is not configured." }
  }

  const bankCode = (args.bankCode ?? "").toUpperCase()
  const loanType = normalizeLoanType(args.loanType)

  if (!bankCode || !loanType) {
    return { available: false, reason: "Both a bank and a loan type are required." }
  }

  const docs = await getDocumentRequirements(bankCode, loanType)

  if (docs.length === 0) {
    const bank = await getBankByCode(bankCode)
    return {
      available: false,
      bankFound: Boolean(bank),
      bankName: bank?.name ?? null,
      supportedLoanTypes: bank?.supportedLoanTypes ?? [],
      loanType,
      reason: bank
        ? "No document checklist is published for this bank and loan type."
        : "Unknown bank code.",
    }
  }

  return {
    available: true,
    bankCode,
    loanType,
    mandatoryDocs: docs.filter((d) => d.mandatory).map((d) => d.docName),
    optionalDocs: docs.filter((d) => !d.mandatory).map((d) => d.docName),
  }
}
