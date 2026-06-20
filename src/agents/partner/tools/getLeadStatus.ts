import { getLeadById, getLeads, resolveLeadByClientName } from "@/lib/crmDb"

/**
 * Read-only: look up lead status either by client name or by status filter.
 * - name: resolves the client; returns detail for a single match, or a
 *   disambiguation list when multiple clients match.
 * - status: returns all leads in that status.
 */
export async function getLeadStatus(partnerOrgId: string, args: { name?: string; status?: string }) {
  if (args.name?.trim()) {
    const matches = await resolveLeadByClientName(partnerOrgId, args.name)
    if (matches.length === 0) {
      return { found: false, reason: `No lead found matching "${args.name}".` }
    }
    if (matches.length > 1) {
      return {
        found: true,
        ambiguous: true,
        matches: matches.map((m) => ({
          clientName: m.clientFullName,
          loanType: m.loanType,
          status: m.status,
          bankAssigned: m.bankAssigned,
        })),
      }
    }
    const detail = await getLeadById(partnerOrgId, matches[0].id)
    return { found: true, ambiguous: false, lead: detail }
  }

  if (args.status?.trim()) {
    const leads = await getLeads(partnerOrgId, args.status.trim())
    return {
      found: true,
      status: args.status.trim(),
      count: leads.length,
      leads: leads.map((l) => ({
        clientName: l.clientFullName,
        loanType: l.loanType,
        loanAmount: l.loanAmount,
        bankAssigned: l.bankAssigned,
        updatedAt: l.updatedAt,
      })),
    }
  }

  return { found: false, reason: "Provide a client name or a status to look up." }
}
