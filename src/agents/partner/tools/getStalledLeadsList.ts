import { getStalledLeads } from "@/lib/crmDb"

/** Read-only: non-terminal leads with no activity in the last N days (default 5). */
export async function getStalledLeadsList(partnerOrgId: string, olderThanDays?: number) {
  const days = typeof olderThanDays === "number" && olderThanDays > 0 ? olderThanDays : 5
  const leads = await getStalledLeads(partnerOrgId, days)
  return {
    olderThanDays: days,
    count: leads.length,
    leads: leads.map((l) => ({
      clientName: l.clientFullName,
      loanType: l.loanType,
      status: l.status,
      bankAssigned: l.bankAssigned,
      lastUpdated: l.updatedAt,
    })),
  }
}
