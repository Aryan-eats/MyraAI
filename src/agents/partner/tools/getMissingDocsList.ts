import { getLeadsWithMissingDocs } from "@/lib/crmDb"

/**
 * Read-only: leads needing document attention. `flaggedDocs` lists the specific
 * uploaded documents that are pending or rejected (capped for readability).
 */
export async function getMissingDocsList(partnerOrgId: string) {
  const leads = await getLeadsWithMissingDocs(partnerOrgId)
  return {
    count: leads.length,
    leads: leads.map((entry) => ({
      clientName: entry.lead.clientFullName,
      loanType: entry.lead.loanType,
      bankAssigned: entry.lead.bankAssigned,
      status: entry.lead.status,
      flaggedDocCount: entry.flaggedDocs.length,
      flaggedDocs: entry.flaggedDocs.slice(0, 8),
    })),
  }
}
