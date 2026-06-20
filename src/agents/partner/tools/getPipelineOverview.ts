import { getPipelineSummary } from "@/lib/crmDb"

/** Read-only: pipeline summary for the partner (counts, stalled, commissions). */
export async function getPipelineOverview(partnerOrgId: string) {
  const summary = await getPipelineSummary(partnerOrgId)
  return {
    totalLeads: summary.totalLeads,
    activeLeads: summary.activeLeads,
    stalledLeads: summary.stalledLeads,
    byStatus: summary.byStatus,
    pendingCommission: summary.pendingCommission,
    totalDisbursed: summary.totalDisbursed,
  }
}
