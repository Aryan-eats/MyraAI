/**
 * Compute the EMI (equated monthly instalment) for a loan.
 *
 * Pure arithmetic — no database access. Numbers are exact and can be presented
 * to the customer directly.
 *
 *   EMI = P · r · (1 + r)^n / ((1 + r)^n − 1)
 *
 * where P = principal, r = monthly interest rate, n = tenure in months.
 * When the rate is zero, EMI is simply P / n.
 */
export function calculateEmi(args: {
  principalAmount: number
  annualInterestRate: number
  tenureMonths: number
}): { monthlyEmi: number; totalPayable: number; totalInterest: number } | { error: string } {
  const { principalAmount, annualInterestRate, tenureMonths } = args

  if (!(principalAmount > 0) || !(tenureMonths > 0) || annualInterestRate < 0) {
    return { error: "principalAmount and tenureMonths must be positive and the rate non-negative." }
  }

  const monthlyRate = annualInterestRate / 12 / 100

  let monthlyEmi: number
  if (monthlyRate === 0) {
    monthlyEmi = principalAmount / tenureMonths
  } else {
    const factor = Math.pow(1 + monthlyRate, tenureMonths)
    monthlyEmi = (principalAmount * monthlyRate * factor) / (factor - 1)
  }

  const roundedEmi = Math.round(monthlyEmi)
  const totalPayable = Math.round(roundedEmi * tenureMonths)
  const totalInterest = Math.round(totalPayable - principalAmount)

  return { monthlyEmi: roundedEmi, totalPayable, totalInterest }
}
