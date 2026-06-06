import { ClientRecord, LoanApplicationRecord, PartnerStatRecord } from "@/server/crm-assistant/types"

export function calculateFoir(existingEmi: number, proposedEmi: number, monthlyIncome: number) {
  if (!monthlyIncome) {
    return 0
  }
  return Number((((existingEmi + proposedEmi) / monthlyIncome) * 100).toFixed(2))
}

export function buildClientHealth(client: ClientRecord, applications: LoanApplicationRecord[]) {
  const latestApplication = applications
    .slice()
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())[0]

  const proposedEmi = latestApplication?.proposedEmi ?? 0
  const foir = calculateFoir(client.existingEmi, proposedEmi, client.monthlyIncome)
  const issues: string[] = []
  const nextSteps: string[] = []

  if (client.cibilScore < 700) {
    issues.push(`CIBIL is ${client.cibilScore}, which is below the preferred 700+ range for faster approvals.`)
    nextSteps.push("Reposition to lenders with relaxed bureau policy or add a stronger co-applicant profile.")
  }

  if (foir > 55) {
    issues.push(`FOIR is ${foir}%, which is high for most lenders.`)
    nextSteps.push("Reduce requested amount, extend tenure, or close an existing EMI before resubmission.")
  }

  if (latestApplication?.missingDocuments.length) {
    issues.push(`Missing documents: ${latestApplication.missingDocuments.join(", ")}.`)
    nextSteps.push("Collect the pending documents before pushing the file back to credit.")
  }

  if (!issues.length) {
    issues.push("No major underwriting issue detected from current profile.")
    nextSteps.push("Follow up with lender RM for faster movement and confirm sanction conditions.")
  }

  return {
    foir,
    issues,
    nextSteps,
    latestApplication,
  }
}

export function buildApprovalInsights(series: PartnerStatRecord[]) {
  const ordered = series.slice().sort((a, b) => a.month.localeCompare(b.month))
  const latest = ordered[ordered.length - 1]
  const previous = ordered[ordered.length - 2]

  const latestRate = latest && latest.submitted ? Number(((latest.approvals / latest.submitted) * 100).toFixed(1)) : 0
  const previousRate = previous && previous.submitted ? Number(((previous.approvals / previous.submitted) * 100).toFixed(1)) : 0
  const rateDelta = Number((latestRate - previousRate).toFixed(1))

  return {
    latest,
    previous,
    latestRate,
    previousRate,
    rateDelta,
    primaryDriver:
      latest.docsPending > (previous?.docsPending ?? 0)
        ? "Docs Pending volume increased and is likely hurting approval conversion."
        : "Approval slowdown is not driven mainly by docs; review lender fit and credit quality.",
  }
}
