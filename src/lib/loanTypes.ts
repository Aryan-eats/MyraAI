/**
 * Loan-type normalisation.
 *
 * The `leads.loan_type` column in the live database holds inconsistent values
 * entered over time ("Personal Loans", "home-loan", "home", "home_loan", ...),
 * while `banks.supported_loan_types` and `lender_doc_requirements.loan_code` use
 * clean snake_case codes ("personal_loan", "home_loan", ...). This module maps
 * any free-form input to a canonical code so the two can be joined or compared.
 */

const CANONICAL_ALIASES: Record<string, string> = {
  personal_loan: "personal_loan",
  personal_loans: "personal_loan",
  personal: "personal_loan",
  home_loan: "home_loan",
  home_loans: "home_loan",
  home: "home_loan",
  housing_loan: "home_loan",
  house_loan: "home_loan",
  lap: "lap",
  loan_against_property: "lap",
  business_loan: "business_loan",
  business_loans: "business_loan",
  business: "business_loan",
  builder_finance: "builder_finance",
  car_loan: "car_loan",
  vehicle_loan: "car_loan",
  auto_loan: "car_loan",
  used_car_loan: "used_car_loan",
  two_wheeler_loan: "two_wheeler_loan",
  gold_loan: "gold_loan",
  education_loan: "education_loan",
}

/**
 * Convert any free-form loan type to a canonical snake_case code.
 * Returns the slugified input when no alias matches (still useful for display
 * and as a best-effort join key).
 */
export function normalizeLoanType(raw: string | null | undefined): string {
  if (!raw) {
    return ""
  }
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z_]/g, "")

  return CANONICAL_ALIASES[slug] ?? slug
}

/**
 * Map common natural-language phrasing from a customer message to a canonical
 * loan type code. Returns null when nothing recognisable is found.
 */
export function loanTypeFromText(text: string): string | null {
  const t = text.toLowerCase()
  if (/\b(loan against property|lap)\b/.test(t)) return "lap"
  if (/\b(home|housing|house)\b/.test(t)) return "home_loan"
  if (/\b(personal)\b/.test(t)) return "personal_loan"
  if (/\b(business)\b/.test(t)) return "business_loan"
  if (/\b(gold)\b/.test(t)) return "gold_loan"
  if (/\b(education|student)\b/.test(t)) return "education_loan"
  if (/\b(two wheeler|two-wheeler|bike|scooter)\b/.test(t)) return "two_wheeler_loan"
  if (/\b(used car)\b/.test(t)) return "used_car_loan"
  if (/\b(car|vehicle|auto)\b/.test(t)) return "car_loan"
  return null
}
