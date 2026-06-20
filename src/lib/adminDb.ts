import { query, queryOne } from "@/lib/pgClient"

/**
 * Platform-wide queries against the GPS India PostgreSQL database (read-only).
 *
 * Powers the admin chatbot. These functions are NOT scoped by partner — they
 * return data across all partners and must only be reachable by admin-role users
 * (enforced at the route layer).
 *
 * SECURITY: encrypted client columns are never selected here.
 */

export type PlatformSummary = {
  totalLeads: number
  activeLeads: number
  disbursals: number
  totalDisbursed: number
  activePartners: number
}

export type PartnerStat = {
  partnerId: string
  partnerName: string
  totalLeads: number
  disbursals: number
  totalDisbursed: number
}

export type BankStat = {
  bankName: string
  totalLeads: number
  approvedCount: number
  approvalRate: number
}

export type AdminLeadSummary = {
  id: string
  clientFullName: string
  loanType: string
  loanAmount: number
  status: string
  bankAssigned: string | null
  partnerName: string
  updatedAt: Date
}

/** Overall platform numbers. */
export async function getPlatformSummary(): Promise<PlatformSummary> {
  const row = await queryOne<{
    total_leads: string
    active_leads: string
    disbursals: string
    total_disbursed: string
    active_partners: string
  }>(
    `SELECT
       COUNT(*) AS total_leads,
       COUNT(*) FILTER (WHERE status NOT IN ('disbursed','rejected')) AS active_leads,
       COUNT(*) FILTER (WHERE status = 'disbursed') AS disbursals,
       COALESCE(SUM(disbursed_amount) FILTER (WHERE status = 'disbursed'), 0) AS total_disbursed,
       COUNT(DISTINCT partner_org_id) AS active_partners
     FROM leads`,
  )

  return {
    totalLeads: Number(row?.total_leads ?? 0),
    activeLeads: Number(row?.active_leads ?? 0),
    disbursals: Number(row?.disbursals ?? 0),
    totalDisbursed: Number(row?.total_disbursed ?? 0),
    activePartners: Number(row?.active_partners ?? 0),
  }
}

/** Partners ranked by disbursal count, then total disbursed. */
export async function getPartnerLeaderboard(limit = 10): Promise<PartnerStat[]> {
  const rows = await query<{
    partner_id: string
    partner_name: string
    total_leads: string
    disbursals: string
    total_disbursed: string
  }>(
    `SELECT p.id AS partner_id, p.name AS partner_name,
            COUNT(l.id) AS total_leads,
            COUNT(l.id) FILTER (WHERE l.status = 'disbursed') AS disbursals,
            COALESCE(SUM(l.disbursed_amount) FILTER (WHERE l.status = 'disbursed'), 0) AS total_disbursed
     FROM partners p
     LEFT JOIN leads l ON l.partner_org_id = p.id
     WHERE p.status = 'active'
     GROUP BY p.id, p.name
     ORDER BY disbursals DESC, total_disbursed DESC
     LIMIT $1`,
    [limit],
  )

  return rows.map((r) => ({
    partnerId: r.partner_id,
    partnerName: r.partner_name,
    totalLeads: Number(r.total_leads),
    disbursals: Number(r.disbursals),
    totalDisbursed: Number(r.total_disbursed),
  }))
}

/** Lead volume and approval rate grouped by assigned bank. */
export async function getBankWiseStats(): Promise<BankStat[]> {
  const rows = await query<{
    bank_assigned: string
    total_leads: string
    approved_count: string
  }>(
    `SELECT bank_assigned,
            COUNT(*) AS total_leads,
            COUNT(*) FILTER (WHERE status IN ('approved','disbursed')) AS approved_count
     FROM leads
     WHERE bank_assigned IS NOT NULL AND bank_assigned <> ''
     GROUP BY bank_assigned
     ORDER BY total_leads DESC`,
  )

  return rows.map((r) => {
    const total = Number(r.total_leads)
    const approved = Number(r.approved_count)
    return {
      bankName: r.bank_assigned,
      totalLeads: total,
      approvedCount: approved,
      approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
    }
  })
}

/** Leads in a specific status across all partners, with partner name. */
export async function getLeadsByStatus(status: string, limit = 25): Promise<AdminLeadSummary[]> {
  const rows = await query<{
    id: string
    client_full_name: string
    loan_type: string
    loan_amount: string | null
    status: string
    bank_assigned: string | null
    partner_name: string | null
    updated_at: Date
  }>(
    `SELECT l.id, l.client_full_name, l.loan_type, l.loan_amount, l.status,
            l.bank_assigned, COALESCE(p.name, l.partner_name) AS partner_name, l.updated_at
     FROM leads l
     LEFT JOIN partners p ON p.id = l.partner_org_id
     WHERE l.status = $1
     ORDER BY l.updated_at DESC
     LIMIT $2`,
    [status, limit],
  )

  return rows.map((r) => ({
    id: r.id,
    clientFullName: r.client_full_name,
    loanType: r.loan_type,
    loanAmount: Number(r.loan_amount ?? 0),
    status: r.status,
    bankAssigned: r.bank_assigned,
    partnerName: r.partner_name ?? "Unknown",
    updatedAt: r.updated_at,
  }))
}

/** All active partner org IDs (for batch jobs like morning briefing). */
export async function getAllActivePartners(): Promise<Array<{ id: string; name: string }>> {
  const rows = await query<{ id: string; name: string }>(
    `SELECT id, name FROM partners WHERE status = 'active'`,
  )
  return rows
}

/** Roles permitted to use the admin chatbot (mirrors the leads RLS admin policy). */
export const ADMIN_ROLES = ["super_admin", "admin", "manager", "agent"] as const

/** Look up a user's role and display name. Null if the user does not exist. */
export async function getUser(
  userId: string,
): Promise<{ id: string; role: string; fullName: string; isActive: boolean } | null> {
  const row = await queryOne<{
    id: string
    role: string
    first_name: string
    last_name: string
    is_active: boolean
  }>(
    `SELECT id, role, first_name, last_name, is_active FROM users WHERE id = $1`,
    [userId],
  )
  if (!row) {
    return null
  }
  return {
    id: row.id,
    role: row.role,
    fullName: `${row.first_name} ${row.last_name}`.trim(),
    isActive: row.is_active,
  }
}
