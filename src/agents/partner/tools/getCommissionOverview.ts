import { getCommissionSummary } from "@/lib/crmDb"

/** Read-only: commission totals by status for the current month. */
export async function getCommissionOverview(partnerOrgId: string) {
  const summary = await getCommissionSummary(partnerOrgId)
  return {
    period: "current_month",
    pending: { amount: summary.pending, count: summary.pendingCount },
    processing: { amount: summary.processing, count: summary.processingCount },
    paid: { amount: summary.paid, count: summary.paidCount },
  }
}
