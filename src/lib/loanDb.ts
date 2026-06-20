import { query, queryOne } from "@/lib/pgClient"

/**
 * Loan product queries against the GPS India PostgreSQL database (read-only).
 *
 * Reads `banks`, `bank_commission_rates`, and `lender_doc_requirements`.
 * Powers the customer-facing chatbot and the admin chatbot.
 */

export type BankProduct = {
  id: string
  name: string
  code: string
  interestRateMin: number
  interestRateMax: number
  processingFee: string
  processingTime: string
  avgTat: number
  minAmount: number
  maxAmount: number
  maxTenure: number
  supportedLoanTypes: string[]
  features: string[]
  isPopular: boolean
  approvalRate: number
}

export type DocRequirement = {
  docId: string
  docName: string
  description: string | null
  mandatory: boolean
  acceptedFormats: string[]
  maxSizeMb: number
}

type BankRow = {
  id: string
  name: string
  code: string
  interest_rate_min: string
  interest_rate_max: string
  processing_fee: string
  processing_time: string
  avg_tat: number
  min_amount: string
  max_amount: string
  max_tenure: number
  supported_loan_types: string[] | null
  features: string[] | null
  is_popular: boolean
  approval_rate: number
}

function mapBank(row: BankRow): BankProduct {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    interestRateMin: Number(row.interest_rate_min),
    interestRateMax: Number(row.interest_rate_max),
    processingFee: row.processing_fee,
    processingTime: row.processing_time,
    avgTat: row.avg_tat,
    minAmount: Number(row.min_amount),
    maxAmount: Number(row.max_amount),
    maxTenure: row.max_tenure,
    supportedLoanTypes: row.supported_loan_types ?? [],
    features: row.features ?? [],
    isPopular: row.is_popular,
    approvalRate: row.approval_rate,
  }
}

const BANK_COLUMNS = `
  id, name, code, interest_rate_min, interest_rate_max, processing_fee,
  processing_time, avg_tat, min_amount, max_amount, max_tenure,
  supported_loan_types, features, is_popular, approval_rate
`

/** All active banks offering a specific loan type, cheapest first. */
export async function getLoanProductsByType(loanType: string): Promise<BankProduct[]> {
  const rows = await query<BankRow>(
    `SELECT ${BANK_COLUMNS}
     FROM banks
     WHERE status = 'active' AND $1 = ANY(supported_loan_types)
     ORDER BY interest_rate_min ASC`,
    [loanType],
  )
  return rows.map(mapBank)
}

/** A single bank's product details for a loan type (null if not found/active). */
export async function getBankProduct(
  bankCode: string,
  loanType: string,
): Promise<BankProduct | null> {
  const row = await queryOne<BankRow>(
    `SELECT ${BANK_COLUMNS}
     FROM banks
     WHERE status = 'active' AND code = $1 AND $2 = ANY(supported_loan_types)`,
    [bankCode.toUpperCase(), loanType],
  )
  return row ? mapBank(row) : null
}

/** A single bank by code regardless of loan type (for "what loans does X offer"). */
export async function getBankByCode(bankCode: string): Promise<BankProduct | null> {
  const row = await queryOne<BankRow>(
    `SELECT ${BANK_COLUMNS} FROM banks WHERE status = 'active' AND code = $1`,
    [bankCode.toUpperCase()],
  )
  return row ? mapBank(row) : null
}

/** All active banks, cheapest first (for comparison queries). */
export async function getAllActiveBanks(): Promise<BankProduct[]> {
  const rows = await query<BankRow>(
    `SELECT ${BANK_COLUMNS} FROM banks WHERE status = 'active' ORDER BY interest_rate_min ASC`,
  )
  return rows.map(mapBank)
}

type DocRow = {
  doc_id: string
  doc_name: string
  description: string | null
  mandatory: boolean
  accepted_formats: string[] | null
  max_size_mb: number
}

/** Document requirements for a lender + loan type, mandatory first. */
export async function getDocumentRequirements(
  lenderCode: string,
  loanCode: string,
): Promise<DocRequirement[]> {
  const rows = await query<DocRow>(
    `SELECT doc_id, doc_name, description, mandatory, accepted_formats, max_size_mb
     FROM lender_doc_requirements
     WHERE lender_code = $1 AND loan_code = $2
     ORDER BY sort_order ASC, mandatory DESC`,
    [lenderCode.toUpperCase(), loanCode],
  )
  return rows.map((row) => ({
    docId: row.doc_id,
    docName: row.doc_name,
    description: row.description,
    mandatory: row.mandatory,
    acceptedFormats: row.accepted_formats ?? [],
    maxSizeMb: row.max_size_mb,
  }))
}
