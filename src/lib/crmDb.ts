import { query, queryOne } from "@/lib/pgClient"

/**
 * Partner pipeline queries against the GPS India PostgreSQL database.
 *
 * Stage 1 (chatbot) uses these read-only. All functions are scoped by
 * `partner_org_id` — the `leads` table has RLS enabled, but we never rely on it
 * from this layer; every query filters on `partner_org_id` explicitly.
 *
 * SECURITY: `client_pan_number` and `client_aadhaar` are encrypted columns and
 * are never selected here — they must not reach the AI model.
 */

export type LeadSummary = {
  id: string
  clientFullName: string
  clientPhone: string
  loanType: string
  loanAmount: number
  status: string
  bankAssigned: string | null
  commissionStatus: string | null
  createdAt: Date
  updatedAt: Date
}

export type LeadDetail = LeadSummary & {
  clientCity: string | null
  clientEmployment: string | null
  clientIncome: number | null
  sanctionedAmount: number | null
  disbursedAmount: number | null
  interestRate: number | null
  tenure: number | null
  documents: Array<{ type: string; status: string; rejectionReason: string | null }>
  timeline: Array<{ status: string; note: string | null; timestamp: Date }>
}

export type PipelineSummary = {
  byStatus: Record<string, number>
  totalLeads: number
  activeLeads: number
  stalledLeads: number
  pendingCommission: number
  totalDisbursed: number
}

export type LeadWithFlaggedDocs = {
  lead: LeadSummary
  flaggedDocs: string[]
}

export type CommissionSummary = {
  pending: number
  processing: number
  paid: number
  pendingCount: number
  processingCount: number
  paidCount: number
}

export type Partner = {
  id: string
  name: string
  partnerType: string
  status: string
  contactEmail: string | null
  contactPhone: string | null
}

const LEAD_SUMMARY_COLUMNS = `
  id, client_full_name, client_phone, loan_type, loan_amount,
  status, bank_assigned, commission_status, created_at, updated_at
`

type LeadSummaryRow = {
  id: string
  client_full_name: string
  client_phone: string
  loan_type: string
  loan_amount: string | null
  status: string
  bank_assigned: string | null
  commission_status: string | null
  created_at: Date
  updated_at: Date
}

function mapLeadSummary(row: LeadSummaryRow): LeadSummary {
  return {
    id: row.id,
    clientFullName: row.client_full_name,
    clientPhone: row.client_phone,
    loanType: row.loan_type,
    loanAmount: Number(row.loan_amount ?? 0),
    status: row.status,
    bankAssigned: row.bank_assigned,
    commissionStatus: row.commission_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const TERMINAL_STATUSES = ["disbursed", "rejected"]

/** Lead pipeline for a partner org, newest activity first. */
export async function getLeads(partnerOrgId: string, status?: string): Promise<LeadSummary[]> {
  if (status) {
    const rows = await query<LeadSummaryRow>(
      `SELECT ${LEAD_SUMMARY_COLUMNS} FROM leads
       WHERE partner_org_id = $1 AND status = $2
       ORDER BY updated_at DESC`,
      [partnerOrgId, status],
    )
    return rows.map(mapLeadSummary)
  }
  const rows = await query<LeadSummaryRow>(
    `SELECT ${LEAD_SUMMARY_COLUMNS} FROM leads
     WHERE partner_org_id = $1
     ORDER BY updated_at DESC`,
    [partnerOrgId],
  )
  return rows.map(mapLeadSummary)
}

/** Single lead with documents and timeline. Null if not owned by this partner. */
export async function getLeadById(
  partnerOrgId: string,
  leadId: string,
): Promise<LeadDetail | null> {
  const row = await queryOne<
    LeadSummaryRow & {
      client_city: string | null
      client_employment: string | null
      client_income: string | null
      sanctioned_amount: string | null
      disbursed_amount: string | null
      interest_rate: string | null
      tenure: number | null
    }
  >(
    `SELECT ${LEAD_SUMMARY_COLUMNS}, client_city, client_employment, client_income,
            sanctioned_amount, disbursed_amount, interest_rate, tenure
     FROM leads
     WHERE partner_org_id = $1 AND id = $2`,
    [partnerOrgId, leadId],
  )
  if (!row) {
    return null
  }

  const documents = await query<{ type: string; status: string; rejection_reason: string | null }>(
    `SELECT type, status, rejection_reason FROM lead_documents WHERE lead_id = $1`,
    [leadId],
  )
  const timeline = await query<{ status: string; note: string | null; timestamp: Date }>(
    `SELECT status, note, timestamp FROM lead_timeline WHERE lead_id = $1 ORDER BY timestamp DESC LIMIT 10`,
    [leadId],
  )

  return {
    ...mapLeadSummary(row),
    clientCity: row.client_city,
    clientEmployment: row.client_employment,
    clientIncome: row.client_income === null ? null : Number(row.client_income),
    sanctionedAmount: row.sanctioned_amount === null ? null : Number(row.sanctioned_amount),
    disbursedAmount: row.disbursed_amount === null ? null : Number(row.disbursed_amount),
    interestRate: row.interest_rate === null ? null : Number(row.interest_rate),
    tenure: row.tenure,
    documents: documents.map((d) => ({
      type: d.type,
      status: d.status,
      rejectionReason: d.rejection_reason,
    })),
    timeline: timeline.map((t) => ({ status: t.status, note: t.note, timestamp: t.timestamp })),
  }
}

/** Counts by status plus active/stalled counts and commission/disbursal totals. */
export async function getPipelineSummary(partnerOrgId: string): Promise<PipelineSummary> {
  const statusRows = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*) AS count FROM leads WHERE partner_org_id = $1 GROUP BY status`,
    [partnerOrgId],
  )

  const totals = await queryOne<{
    total: string
    active: string
    stalled: string
    pending_commission: string
    total_disbursed: string
  }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status NOT IN ('disbursed','rejected')) AS active,
       COUNT(*) FILTER (
         WHERE status NOT IN ('disbursed','rejected')
           AND updated_at < NOW() - INTERVAL '5 days'
       ) AS stalled,
       COALESCE(SUM(commission_amount) FILTER (WHERE commission_status = 'pending'), 0) AS pending_commission,
       COALESCE(SUM(disbursed_amount) FILTER (WHERE status = 'disbursed'), 0) AS total_disbursed
     FROM leads WHERE partner_org_id = $1`,
    [partnerOrgId],
  )

  const byStatus: Record<string, number> = {}
  for (const r of statusRows) {
    byStatus[r.status] = Number(r.count)
  }

  return {
    byStatus,
    totalLeads: Number(totals?.total ?? 0),
    activeLeads: Number(totals?.active ?? 0),
    stalledLeads: Number(totals?.stalled ?? 0),
    pendingCommission: Number(totals?.pending_commission ?? 0),
    totalDisbursed: Number(totals?.total_disbursed ?? 0),
  }
}

/**
 * Leads needing document attention: either in `docs_pending` status, or with
 * uploaded documents currently `pending`/`rejected`. `flaggedDocs` lists the
 * specific uploaded documents that are pending or rejected (empty when a lead is
 * awaiting its first upload).
 */
export async function getLeadsWithMissingDocs(
  partnerOrgId: string,
): Promise<LeadWithFlaggedDocs[]> {
  const rows = await query<LeadSummaryRow & { flagged_docs: string[] | null }>(
    `SELECT ${LEAD_SUMMARY_COLUMNS.split(",").map((c) => `l.${c.trim()}`).join(", ")},
            COALESCE(
              array_agg(DISTINCT ld.type) FILTER (WHERE ld.status IN ('pending','rejected')),
              '{}'
            ) AS flagged_docs
     FROM leads l
     LEFT JOIN lead_documents ld ON ld.lead_id = l.id
     WHERE l.partner_org_id = $1
       AND (l.status = 'docs_pending' OR ld.status IN ('pending','rejected'))
     GROUP BY l.id
     ORDER BY l.updated_at DESC`,
    [partnerOrgId],
  )

  return rows.map((row) => ({
    lead: mapLeadSummary(row),
    flaggedDocs: row.flagged_docs ?? [],
  }))
}

/** Non-terminal leads not updated in the last N days (default 5). */
export async function getStalledLeads(
  partnerOrgId: string,
  olderThanDays = 5,
): Promise<LeadSummary[]> {
  const rows = await query<LeadSummaryRow>(
    `SELECT ${LEAD_SUMMARY_COLUMNS} FROM leads
     WHERE partner_org_id = $1
       AND status NOT IN ('disbursed','rejected')
       AND updated_at < NOW() - ($2 || ' days')::interval
     ORDER BY updated_at ASC`,
    [partnerOrgId, String(olderThanDays)],
  )
  return rows.map(mapLeadSummary)
}

/** Commission totals grouped by status for the current calendar month. */
export async function getCommissionSummary(partnerOrgId: string): Promise<CommissionSummary> {
  const rows = await query<{ commission_status: string | null; cnt: string; amt: string }>(
    `SELECT commission_status, COUNT(*) AS cnt, COALESCE(SUM(commission_amount), 0) AS amt
     FROM leads
     WHERE partner_org_id = $1
       AND date_trunc('month', created_at) = date_trunc('month', NOW())
     GROUP BY commission_status`,
    [partnerOrgId],
  )

  const summary: CommissionSummary = {
    pending: 0,
    processing: 0,
    paid: 0,
    pendingCount: 0,
    processingCount: 0,
    paidCount: 0,
  }

  for (const r of rows) {
    if (r.commission_status === "pending") {
      summary.pending = Number(r.amt)
      summary.pendingCount = Number(r.cnt)
    } else if (r.commission_status === "processing") {
      summary.processing = Number(r.amt)
      summary.processingCount = Number(r.cnt)
    } else if (r.commission_status === "paid") {
      summary.paid = Number(r.amt)
      summary.paidCount = Number(r.cnt)
    }
  }

  return summary
}

/** Resolve a client by partial name (case-insensitive). Multiple = ambiguous. */
export async function resolveLeadByClientName(
  partnerOrgId: string,
  name: string,
): Promise<LeadSummary[]> {
  const trimmed = name.trim()
  if (!trimmed) {
    return []
  }
  const rows = await query<LeadSummaryRow>(
    `SELECT ${LEAD_SUMMARY_COLUMNS} FROM leads
     WHERE partner_org_id = $1 AND client_full_name ILIKE $2
     ORDER BY updated_at DESC
     LIMIT 10`,
    [partnerOrgId, `%${trimmed}%`],
  )
  return rows.map(mapLeadSummary)
}

/** True when an active WhatsApp consent grant exists for this lead + partner. */
export async function hasWhatsappConsent(
  leadId: string,
  partnerOrgId: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM consent_grants
     WHERE lead_id = $1 AND partner_id = $2
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [leadId, partnerOrgId],
  )
  return row !== null
}

/** Partner org record. */
export async function getPartner(partnerOrgId: string): Promise<Partner | null> {
  const row = await queryOne<{
    id: string
    name: string
    partner_type: string
    status: string
    contact_email: string | null
    contact_phone: string | null
  }>(
    `SELECT id, name, partner_type, status, contact_email, contact_phone
     FROM partners WHERE id = $1`,
    [partnerOrgId],
  )
  if (!row) {
    return null
  }
  return {
    id: row.id,
    name: row.name,
    partnerType: row.partner_type,
    status: row.status,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
  }
}

/**
 * Resolve the active partner org for an authenticated user (JWT subject).
 * Matches either the org owner or an active partner_users membership.
 */
export async function resolvePartnerOrgForUser(
  userId: string,
): Promise<{ partnerOrgId: string; name: string; status: string } | null> {
  const row = await queryOne<{ partner_org_id: string; name: string; status: string }>(
    `SELECT p.id AS partner_org_id, p.name, p.status
     FROM partners p
     LEFT JOIN partner_users pu
       ON pu.partner_id = p.id AND pu.user_id = $1 AND pu.is_active = true
     WHERE (p.owner_user_id = $1 OR pu.user_id = $1) AND p.status = 'active'
     LIMIT 1`,
    [userId],
  )
  if (!row) {
    return null
  }
  return { partnerOrgId: row.partner_org_id, name: row.name, status: row.status }
}

export { TERMINAL_STATUSES }
