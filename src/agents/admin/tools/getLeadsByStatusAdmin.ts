import { getLeadsByStatus } from "@/lib/adminDb"

/** Read-only: leads in a given status across all partners (with partner name). */
export async function getLeadsByStatusAdmin(args: { status: string; limit?: number }) {
  const status = (args.status ?? "").trim()
  if (!status) {
    return { error: "A lead status is required (e.g. docs_pending, approved, rejected)." }
  }
  const limit = typeof args.limit === "number" && args.limit > 0 ? Math.min(args.limit, 100) : 25
  const leads = await getLeadsByStatus(status, limit)
  return {
    status,
    count: leads.length,
    leads: leads.map((l) => ({
      clientName: l.clientFullName,
      partnerName: l.partnerName,
      loanType: l.loanType,
      loanAmount: l.loanAmount,
      bankAssigned: l.bankAssigned,
      updatedAt: l.updatedAt,
    })),
  }
}
