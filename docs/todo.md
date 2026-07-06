# GPS India — Myra AI: Build Plan

**Updated:** 2026-06-12  
**Database inspected:** `postgresql://postgres:***@localhost:5432/postgres`

---

## Goal and Delivery Order

Build in two stages. Do not start Stage 2 until all three Stage 1 chatbots are returning verified correct answers.

```
STAGE 1 — CHATBOT (read-only Q&A, no actions)
  Phase 1: PostgreSQL foundation            ← blocking everything
  Phase 2: Customer website chatbot         ← loan rates, docs, EMI from real DB
  Phase 3: Partner dashboard chatbot        ← pipeline, docs, commissions (read-only)
  Phase 4: Admin dashboard chatbot          ← platform-wide analytics (read-only)
  ✅ Validation checkpoint
  
STAGE 2 — AGENTIC (actions, writes, scheduling)
  Phase 5: Partner copilot actions          ← WhatsApp sends, notes, name resolution
  Phase 6: Scheduled WhatsApp reminders     ← cron job + webhook trigger
  Phase 7: Morning briefing                 ← daily summary with WhatsApp delivery
  Phase 8: Security hardening               ← auth on knowledge routes
```

**The distinction:** Stage 1 tools only read from the database and return data. The model answers questions. Stage 2 tools write to the database, send messages, or trigger external services.

---

## Real Database Schema (verified by direct inspection)

Use these table and column names exactly in all queries.

### Loan Products
```
banks
  id uuid PK
  name text                          -- "HDFC Bank", "ICICI Bank", "SBI", "Bajaj Finserv", "Muthoot Finance" ...
  code text UNIQUE                   -- "HDFC", "ICICI", "SBI", "BAJAJ", "MUTHOOT" ...
  status "BankStatus"                -- filter: WHERE status = 'active'
  supported_loan_types text[]        -- {"home_loan","personal_loan","car_loan","lap","gold_loan","business_loan",...}
  interest_rate_min numeric(5,2)     -- e.g. 8.50
  interest_rate_max numeric(5,2)     -- e.g. 14.00
  processing_fee text                -- freeform, e.g. "0.5% - 2%"
  processing_time text               -- freeform, e.g. "3-10 days"
  avg_tat integer                    -- average turnaround in days
  min_amount / max_amount numeric(15,2)
  max_tenure integer                 -- months
  features text[]
  is_popular boolean
  approval_rate integer              -- percent

bank_commission_rates
  bank_id uuid → banks.id
  loan_type text
  partner_commission numeric(5,2)   -- percent commission GPS India earns
  interest_rate text                 -- freeform rate detail
  min_amount / max_amount numeric(15,2)
  max_tenure integer
```

### Document Requirements
```
lender_doc_requirements
  lender_code text                   -- matches banks.code
  lender_name text
  loan_code text                     -- matches supported_loan_types values
  doc_id text                        -- internal slug, e.g. "salary_slip_3m"
  doc_name text                      -- human label, e.g. "Last 3 Months Salary Slips"
  description text
  mandatory boolean
  accepted_formats text[]
  max_size_mb integer
  sort_order integer

⚠️  lead_documents.type stores the human-readable doc_name ("Aadhaar Card"),
    NOT the doc_id slug ("aadhaar"). Always join on doc_name, not doc_id.
```

### Partner Pipeline
```
leads                                -- central entity; client data embedded here
  id uuid PK
  client_full_name / client_phone / client_email / client_city text
  client_employment "EmploymentType"
  client_income / client_experience  numeric / integer
  client_company text
  client_pan_number / client_aadhaar text   ⚠️ ENCRYPTED — never SELECT or pass to AI
  loan_type text
  loan_amount / sanctioned_amount / disbursed_amount / emi numeric
  interest_rate numeric(5,2)
  tenure integer
  bank_assigned / bank_code / preferred_bank text
  status "LeadStatus"
    -- enum: draft | submitted | docs_pending | docs_uploaded |
    --       docs_collected | bank_processing | bank_logged |
    --       approved | disbursed | rejected
    -- terminal statuses (exclude from active queries): disbursed, rejected
  partner_org_id uuid → partners.id  -- ALWAYS scope queries on this column
  partner_id uuid → users.id         -- individual submitter
  commission_amount / commission_rate numeric
  commission_status "CommissionStatus"  -- pending | processing | paid
  commission_paid_at timestamptz
  is_eligible boolean
  internal_notes text
  created_at / updated_at

⚠️  RLS is enabled. Connect as superuser and filter with WHERE partner_org_id = $1.
    Never rely on RLS policies from the AI layer.

lead_documents
  lead_id uuid → leads.id
  type text                          -- human-readable doc name (joins to lender_doc_requirements.doc_name)
  status "DocumentStatus"            -- pending | submitted | verified | rejected
  rejection_reason text

lead_timeline
  lead_id uuid → leads.id
  status "LeadStatus"
  timestamp timestamptz
  note / updated_by text

submission_events
  lead_id uuid → leads.id
  partner_org_id uuid
  old_status / new_status / change_source text
  note text
  metadata jsonb
```

### WhatsApp Consent
```
consent_grants
  lead_id uuid → leads.id
  partner_id uuid → partners.id
  granted_to text
  granted_at / expires_at / revoked_at timestamptz
  -- Active: revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
```

### Org Structure
```
partners
  id uuid PK                         -- this is partner_org_id on leads
  name / partner_type / status text
  owner_user_id uuid → users.id
  contact_email / contact_phone text

partner_users
  partner_id uuid → partners.id
  user_id uuid → users.id
  role text
  is_active boolean

users
  id uuid PK
  email / first_name / last_name / phone text
  role "UserRole"                    -- partner | super_admin | admin | manager | agent
  onboarding_status / kyc_status
```

---

## Guiding Principles

- Never delete existing files. Extend, don't replace.
- TypeScript strict mode. No `any` without a `// TODO` comment explaining why.
- Stage 1 tools are read-only. No DB writes, no external sends, no side effects.
- All DB queries scoped by `partner_org_id` for partner context, or admin-role-gated for cross-partner queries.
- All API routes validate with Zod before processing.
- After each phase: `npm run build && npm test` before continuing.

---

---

# STAGE 1: CHATBOT

---

## Phase 1: PostgreSQL Foundation (Blocking Everything)

### 1.1 — Install PostgreSQL driver
```bash
npm install pg @types/pg
```

### 1.2 — Create `src/lib/pgClient.ts`

Singleton `pg.Pool`. Reads `DATABASE_URL`. No ORM — raw SQL throughout.

```typescript
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
```

Add to `.env.example`:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres
```

Update `docker-compose.yml` env block: `DATABASE_URL` instead of `POSTGRES_URL`.

> **Note on bundled Docker postgres:** `docker-compose.yml` initialises `gps_crm` from `db/crm_assistant_schema.sql` — that is the obsolete demo design and does not match the real schema. `DATABASE_URL` must point at the real GPS India database. The bundled postgres is not useful until someone dumps the real schema into it (`pg_dump --schema-only`).

### 1.3 — Create `src/lib/loanDb.ts` — Loan product queries (read-only)

Powers the customer and admin chatbots. Reads `banks`, `lender_doc_requirements`, `bank_commission_rates`.

```typescript
// All active banks for a loan type. Query: WHERE status='active' AND $1=ANY(supported_loan_types)
getLoanProductsByType(loanType: string): Promise<BankProduct[]>

// Single bank + loan type details (left joins bank_commission_rates)
getBankProduct(bankCode: string, loanType: string): Promise<BankProduct | null>

// All active banks sorted by interest_rate_min (for comparison tables)
getAllActiveBanks(): Promise<BankProduct[]>

// Document requirements for a lender + loan type.
// ORDER BY sort_order, mandatory DESC
getDocumentRequirements(lenderCode: string, loanCode: string): Promise<DocRequirement[]>
```

Return types:
```typescript
type BankProduct = {
  id: string; name: string; code: string;
  interestRateMin: number; interestRateMax: number;
  processingFee: string; processingTime: string; avgTat: number;
  minAmount: number; maxAmount: number; maxTenure: number;
  supportedLoanTypes: string[]; features: string[];
  isPopular: boolean; approvalRate: number;
};
type DocRequirement = {
  docId: string; docName: string; description: string | null;
  mandatory: boolean; acceptedFormats: string[]; maxSizeMb: number;
};
```

### 1.4 — Create `src/lib/crmDb.ts` — Partner pipeline queries (read-only in Stage 1)

Powers the partner chatbot. All functions take `partnerOrgId: string` as first argument.

```typescript
// Lead pipeline, optionally filtered by status
// SELECT id, client_full_name, client_phone, loan_type, loan_amount,
//        status, bank_assigned, commission_status, created_at, updated_at
// FROM leads WHERE partner_org_id = $1 [AND status = $2] ORDER BY updated_at DESC
getLeads(partnerOrgId: string, status?: string): Promise<LeadSummary[]>

// Single lead + its document list + timeline (no encrypted fields)
getLeadById(partnerOrgId: string, leadId: string): Promise<LeadDetail | null>

// Counts grouped by status, active/stalled counts, commission and disbursal totals
getPipelineSummary(partnerOrgId: string): Promise<PipelineSummary>

// Leads where required docs are missing (join with lender_doc_requirements on doc_name)
getLeadsWithMissingDocs(partnerOrgId: string): Promise<LeadWithMissingDocs[]>

// Leads not updated in > N days with non-terminal status
getStalledLeads(partnerOrgId: string, olderThanDays?: number): Promise<LeadSummary[]>

// Commission totals grouped by status for current month
getCommissionSummary(partnerOrgId: string): Promise<CommissionSummary>

// Resolve client by partial name match (ILIKE). Returns multiple if ambiguous.
resolveLeadByClientName(partnerOrgId: string, name: string): Promise<LeadSummary[]>

// WhatsApp consent check from consent_grants table
// Active: revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
hasWhatsappConsent(leadId: string, partnerOrgId: string): Promise<boolean>

// Partner org record
getPartner(partnerOrgId: string): Promise<Partner | null>

// Resolve partner_org_id from JWT user ID (for auth middleware)
// SELECT p.id, p.name, p.status FROM partners p
// LEFT JOIN partner_users pu ON pu.partner_id = p.id AND pu.user_id = $1 AND pu.is_active = true
// WHERE p.owner_user_id = $1 OR pu.user_id = $1 LIMIT 1
resolvePartnerOrgForUser(userId: string): Promise<{ partnerOrgId: string; name: string } | null>
```

Return types:
```typescript
type LeadSummary = {
  id: string; clientFullName: string; clientPhone: string;
  loanType: string; loanAmount: number; status: string;
  bankAssigned: string | null; commissionStatus: string | null;
  createdAt: Date; updatedAt: Date;
};
type PipelineSummary = {
  byStatus: Record<string, number>;
  totalLeads: number; activeLeads: number; stalledLeads: number;
  pendingCommission: number; totalDisbursed: number;
};
type LeadWithMissingDocs = {
  lead: LeadSummary;
  missingDocNames: string[];
};
type CommissionSummary = {
  pending: number; processing: number; paid: number;
  pendingCount: number; processingCount: number; paidCount: number;
};
```

### 1.5 — Create `src/lib/adminDb.ts` — Platform-wide queries (read-only, admin-only)

Powers the admin chatbot. No `partner_org_id` scoping — returns data across all partners.

```typescript
// Overall platform numbers
// SELECT COUNT(*) total_leads, COUNT(*) FILTER (WHERE status='disbursed') disbursals,
//        SUM(disbursed_amount) FILTER (WHERE status='disbursed') total_disbursed,
//        COUNT(DISTINCT partner_org_id) active_partners FROM leads
getPlatformSummary(): Promise<PlatformSummary>

// Partners ranked by disbursal count and amount
// SELECT p.name, COUNT(l.id), COUNT(l.id) FILTER (WHERE l.status='disbursed'),
//        SUM(l.disbursed_amount) FILTER (WHERE l.status='disbursed')
// FROM partners p LEFT JOIN leads l ON l.partner_org_id = p.id GROUP BY p.id ORDER BY disbursals DESC
getPartnerLeaderboard(limit?: number): Promise<PartnerStat[]>

// Leads and approval rates grouped by bank
// SELECT bank_assigned, COUNT(*), COUNT(*) FILTER (WHERE status IN ('approved','disbursed'))
// FROM leads WHERE bank_assigned IS NOT NULL GROUP BY bank_assigned
getBankWiseStats(): Promise<BankStat[]>

// Recent platform activity: last N leads with status changes
getRecentActivity(limit?: number): Promise<ActivityEntry[]>

// Leads in a specific status across all partners (for ops monitoring)
getLeadsByStatus(status: string, limit?: number): Promise<LeadSummary[]>
```

Return types:
```typescript
type PlatformSummary = {
  totalLeads: number; activeLeads: number; disbursals: number;
  totalDisbursed: number; activePartners: number;
};
type PartnerStat = {
  partnerId: string; partnerName: string;
  totalLeads: number; disbursals: number; totalDisbursed: number;
};
type BankStat = {
  bankName: string; totalLeads: number; approvedCount: number; approvalRate: number;
};
```

### 1.6 — Update auth middleware to resolve `partner_org_id` from real DB

In `src/lib/chatAuth.ts` → `requirePartnerAuth`:
1. Keep JWT signature validation as-is.
2. After validating the JWT, call `resolvePartnerOrgForUser(userId)` from `crmDb.ts`.
3. The returned `partner_org_id` becomes `AuthenticatedPartner.partnerId` for all downstream queries.
4. If the user maps to no active partner org → return 401.

For admin routes: verify `users.role IN ('super_admin', 'admin', 'manager', 'agent')` from the DB instead of relying on the JWT claim alone.

### 1.7 — Update `src/lib/briefingGenerator.ts` (wiring only — full feature in Phase 7)

Replace all four `gpsBridge` calls with `crmDb.ts` equivalents so Phase 7 has real data to work with:
```
fetchPartnerPipelineSnapshot  →  getPipelineSummary(partnerOrgId)
fetchPartnerTodaysActions      →  getLeadsWithMissingDocs + getStalledLeads
fetchPartnerCommissionSnapshot →  getCommissionSummary(partnerOrgId)
fetchPartnerRiskFlags          →  getStalledLeads(partnerOrgId, 7)
```

### 1.8 — Replace `DemoCrmRepository` with `PostgresCrmRepository`

Create `src/server/crm-assistant/pg-repository.ts` backed by `crmDb.ts`. Update `service.ts` to use it when `DATABASE_URL` is set, `DemoCrmRepository` otherwise. Do not delete the demo fallback.

### 1.9 — Tests

- `src/tests/loanDb.test.ts`: mock `pg.Pool`. Test `getLoanProductsByType` filters by `ANY(supported_loan_types)`, `getDocumentRequirements` sorts by `sort_order`, `getBankProduct` returns null for unknown code.
- `src/tests/crmDb.test.ts`: test `getPipelineSummary` grouping, `resolveLeadByClientName` returns multiple for ambiguous names, `hasWhatsappConsent` returns false when `revoked_at` is set, `resolvePartnerOrgForUser` returns null when no match.
- `src/tests/adminDb.test.ts`: test `getPlatformSummary` aggregation, `getPartnerLeaderboard` orders by disbursals descending.

---

## Phase 2: Customer Website Chatbot

Route: `POST /api/chat/web` (already exists). Make it read from the real database and give accurate answers.

### 2.1 — Rework `src/agents/web/tools/searchKnowledge.ts`

Replace MongoDB `searchLendingKnowledge` with `getLoanProductsByType` / `getBankProduct` from `loanDb.ts`.

The tool extracts from the customer message:
- `loanType` — map natural language: "home loan" → `home_loan`, "personal loan" → `personal_loan`, "car loan" → `car_loan`, "loan against property" / "LAP" → `lap`, "gold loan" → `gold_loan`, "business loan" → `business_loan`
- `bankCode` (optional) — "HDFC" → `HDFC`, "SBI" → `SBI`, "Bajaj" / "Bajaj Finserv" → `BAJAJ`, "Muthoot" → `MUTHOOT`

Returns a structured object — not prose. The model writes the answer.

Fall back to MongoDB `searchLendingKnowledge` when `DATABASE_URL` is not set.

### 2.2 — Rework `src/agents/web/tools/compareProducts.ts`

Call `getLoanProductsByType(loanType)`, sort by `interest_rate_min`, return:
```typescript
[{ bankName, rateRange, processingFee, processingTime, avgTat, minAmount, maxAmount }]
```
Do not render markdown in the tool — let the model format the table.

### 2.3 — Add `src/agents/web/tools/getDocuments.ts`

New tool for: "what documents do I need for an HDFC home loan?"

```typescript
// args: { bankCode: string, loanType: string }
// calls: getDocumentRequirements(bankCode, loanType)
// returns: { lenderName, loanType, mandatoryDocs: string[], optionalDocs: string[] }
```

Register in the web agent's tool list alongside the existing three tools.

### 2.4 — Add `src/agents/web/tools/calculateEmi.ts`

New tool for: "what will my EMI be for 20 lakh at 9% for 20 years?"

```typescript
// Pure math — no DB call
// EMI = P × r × (1+r)^n / ((1+r)^n − 1)
// r = annualInterestRate / 12 / 100
export function calculateEmi(args: {
  principalAmount: number;
  annualInterestRate: number;  // e.g. 9.5 (not 0.095)
  tenureMonths: number;
}): { monthlyEmi: number; totalPayable: number; totalInterest: number }
```

Register in the web agent's tool list.

### 2.5 — Update `src/agents/web/persona.ts`

Key changes:
- Data from `searchKnowledge` and `compareProducts` tools comes from the live GPS India lender database — it is accurate. Do not add "please verify with the lender" disclaimers.
- EMI calculator output is exact — present numbers directly.
- Document list from `getDocuments` is the official lender checklist — no hedging.
- If a bank does not offer the requested loan type, say so explicitly ("HDFC does not offer gold loans").
- Respond in the language the customer writes in (Hindi or English).
- Lead capture (`captureLead` tool) is still available but only trigger it when the customer clearly wants to apply.

### 2.6 — Tests

`src/tests/web-agent-pg.test.ts`:
- "home loan HDFC" → calls `getBankProduct("HDFC", "home_loan")`
- "compare personal loan rates" → calls `getLoanProductsByType("personal_loan")`, sorted by rate
- "what is my EMI for 20L at 9% for 20 years" → returns ₹17,995/month
- "what documents for HDFC home loan" → calls `getDocumentRequirements("HDFC", "home_loan")`
- Unknown bank → returns structured not-found, model says it does not have that data

---

## Phase 3: Partner Dashboard Chatbot

**Read-only.** Partners can ask questions about their pipeline. No messages sent, no data written.

Route: extend `POST /api/chat/crm` OR create `POST /api/chat/partner` — either way, requires partner JWT and `partner_org_id` resolution (Phase 1.6).

### 3.1 — Resolve `partner_org_id` from JWT (prerequisite — done in Phase 1.6)

Verify Phase 1.6 is complete before proceeding. Every tool in this phase requires a valid `partnerOrgId`.

### 3.2 — Create read-only partner tools

Create these tools in `src/agents/crm/tools/` (Stage 1 versions — read-only):

**`getPipelineOverview.ts`** — answers: "how many leads do I have?", "what's my pipeline status?"
```typescript
// calls: getPipelineSummary(partnerOrgId)
// returns: counts by status, active count, stalled count, pending commission, total disbursed
```

**`getLeadStatus.ts`** — answers: "what's the status of Priya's loan?" or "show me all docs_pending leads"
```typescript
// args: { name?: string, status?: string }
// if name: calls resolveLeadByClientName, then getLeadById for the matched lead
// if status: calls getLeads(partnerOrgId, status)
// returns: lead detail or list
```

**`getMissingDocsList.ts`** — answers: "which leads have missing documents?"
```typescript
// calls: getLeadsWithMissingDocs(partnerOrgId)
// returns: list of { clientName, loanType, bankName, missingDocs[] }
```

**`getCommissionOverview.ts`** — answers: "what are my commissions this month?"
```typescript
// calls: getCommissionSummary(partnerOrgId)
// returns: pending/processing/paid amounts and counts
```

**`getStalledLeadsList.ts`** — answers: "which leads haven't moved in a while?"
```typescript
// calls: getStalledLeads(partnerOrgId, 5)
// returns: list sorted by most stagnant first
```

All five tools are read-only. No write operations.

### 3.3 — Update `src/agents/crm/persona.ts` for chatbot mode

Add a chatbot mode to the persona. When running as chatbot (Stage 1), the system prompt should:
- Tell the model it can only answer questions and retrieve information.
- Explicitly state it cannot send messages, write notes, or take actions yet.
- Be direct: give exact numbers, names, and statuses from the data returned by tools.
- If the partner asks to take an action (send a WhatsApp, add a note), respond: "I can see that information but I'm not able to take actions yet. You can do this directly in the dashboard."

### 3.4 — Tests

`src/tests/partner-chatbot.test.ts`:
- "how many leads do I have" → calls `getPipelineSummary`
- "show me docs pending leads" → calls `getLeads(orgId, 'docs_pending')`
- "what's Priya's loan status" → resolves name, calls `getLeadById`
- "send Priya a reminder" → returns "I cannot take actions yet" (Stage 1 boundary)
- Invalid JWT → 401

---

## Phase 4: Admin Dashboard Chatbot

**Read-only.** Admins can ask questions about the whole platform. No partner org scoping.

Route: `POST /api/chat/admin` — new route, requires admin role JWT.

### 4.1 — Create `POST /api/chat/admin` route

`src/app/api/chat/admin/route.ts`:
- Validate JWT, then query `users` table to verify `role IN ('super_admin', 'admin', 'manager', 'agent')`.
- If not admin role → 403.
- Schema: `z.object({ message: z.string().min(1).max(2000), sessionId: z.string().optional() })`.
- Sets `export const runtime = 'nodejs'`.
- Same CORS + rate limit pattern as existing chat routes.

### 4.2 — Create admin agent

`src/agents/admin/persona.ts` and `src/agents/admin/agent.ts`:

**Persona**: Myra, GPS India's internal operations assistant. Access to platform-wide lead data, partner performance, and bank statistics. Direct and data-first. Responds with exact numbers. Does not take any actions.

**Tools** (read-only):

**`getPlatformOverview.ts`** — "how many leads total?", "what's the platform doing this month?"
```typescript
// calls: getPlatformSummary() from adminDb.ts
// returns: totalLeads, activeLeads, disbursals, totalDisbursed, activePartners
```

**`getPartnerPerformance.ts`** — "who are the top performing partners?", "which partners have stalled leads?"
```typescript
// calls: getPartnerLeaderboard(limit) from adminDb.ts
// optional: accepts partnerName to drill into one partner's stats
```

**`getBankStats.ts`** — "which banks have the highest approval rates?", "how many leads sent to HDFC?"
```typescript
// calls: getBankWiseStats() from adminDb.ts
```

**`getLeadsByStatusAdmin.ts`** — "show me all rejected leads", "how many leads are bank_processing?"
```typescript
// calls: getLeadsByStatus(status, limit) from adminDb.ts
// returns: lead list with partner name included
```

### 4.3 — Tests

`src/tests/admin-chatbot.test.ts`:
- Non-admin JWT → 403
- "how many active leads" → calls `getPlatformSummary`
- "top 5 partners" → calls `getPartnerLeaderboard(5)`
- "HDFC approval rate" → calls `getBankWiseStats`, filters for HDFC

---

## ✅ Stage 1 Validation Checkpoint

Before starting Stage 2, manually verify all three chatbots return correct answers against the live database:

**Customer chatbot (`/api/chat/web`):**
- [ ] "What is the interest rate for HDFC personal loan?" → from `banks` table, not seed file
- [ ] "Compare home loan rates from SBI and ICICI" → live sorted data
- [ ] "What will my EMI be for 20 lakh at 9% for 20 years?" → ₹17,995/month
- [ ] "What documents do I need for an HDFC home loan?" → from `lender_doc_requirements`
- [ ] "What loans does Bajaj Finserv offer?" → reads `supported_loan_types`
- [ ] Unknown bank → "I don't have data for that bank"

**Partner chatbot (`/api/chat/crm` or `/api/chat/partner`):**
- [ ] "How many leads do I have?" → real count from `leads WHERE partner_org_id = ?`
- [ ] "Which leads have missing documents?" → real join with `lender_doc_requirements`
- [ ] "What's my commission this month?" → aggregated from `leads.commission_amount`
- [ ] "Which leads haven't moved in 5 days?" → real stalled query
- [ ] "Send Priya a reminder" → "I can't take actions yet" response
- [ ] Wrong/missing JWT → 401

**Admin chatbot (`/api/chat/admin`):**
- [ ] "How many total leads on the platform?" → from `leads` no org filter
- [ ] "Top 3 partners by disbursals" → ranked from `getPartnerLeaderboard`
- [ ] "Which bank has the most leads?" → from `getBankWiseStats`
- [ ] Partner-role JWT → 403

---

---

# STAGE 2: AGENTIC

*Start only after Stage 1 validation checkpoint passes.*

---

## Phase 5: Partner Copilot — Actions

Upgrade the partner chatbot to take real actions. Adds write tools alongside the existing read tools.

### 5.1 — WhatsApp sending tool

In `src/agents/crm/tools/sendWhatsapp.ts` (already exists), wire consent check to `hasWhatsappConsent` from `crmDb.ts` instead of the GPS bridge call.

Add client name resolution before the agentic loop in `src/agents/crm/agent.ts`:
```typescript
// Extract name from message, call resolveLeadByClientName
// If 1 match: inject "Resolved: {name}, leadId={id}, phone={phone}" into system context
// If 2+ matches: return clarification list immediately, do not run the loop
// If 0 matches: proceed — model will ask for the name
```

### 5.2 — Notes tool

In `src/agents/crm/tools/addPartnerNote.ts`, write to `leads.internal_notes`:
```sql
UPDATE leads
SET internal_notes = COALESCE(internal_notes, '') || chr(10) || '[' || NOW()::date || '] ' || $2,
    updated_at = NOW()
WHERE id = $1 AND partner_org_id = $3
```
Also insert a row into `submission_events` with `change_source = 'ai_note'` for audit trail.

### 5.3 — Update partner persona for agentic mode

Remove the "I cannot take actions" constraint from Phase 3.3. Restore the full CRM persona from `getCrmSystemPrompt`. The model can now act.

### 5.4 — Tests

Update `src/tests/crm-agent.test.ts`:
- Mock `crmDb`, not `gpsBridge`
- Single name match → context injected, WhatsApp sent
- Multiple matches → clarification returned, no send
- Note write → `submission_events` row created

---

## Phase 6: Scheduled WhatsApp Reminders

### 6.1 — Add `reminder_log` table

Create `db/migrations/2026-06-12_reminder_log.sql` and apply to the live database:

```sql
CREATE TABLE IF NOT EXISTS reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  partner_org_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  client_phone text NOT NULL,
  template_name text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT NOW(),
  status text NOT NULL CHECK (status IN ('sent', 'blocked', 'failed'))
);
CREATE INDEX reminder_log_lead_id_sent_at ON reminder_log(lead_id, sent_at DESC);
```

> **Migration target:** apply with `psql "$DATABASE_URL" -f db/migrations/2026-06-12_reminder_log.sql`. Notify the GPS website backend team — the real database is Prisma-managed and they need to add this model to avoid schema drift on their next `prisma migrate`.

Add to `crmDb.ts`:
```typescript
logReminder(leadId, partnerOrgId, clientPhone, templateName, status): Promise<void>
getLeadsDueForReminder(): Promise<ReminderTarget[]>
```

`getLeadsDueForReminder` query (two branches, deduplicated by `lead_id`, prefer `missing_docs`):
```sql
-- Branch 1: missing mandatory docs, no reminder in past 3 days
SELECT l.id, l.partner_org_id, l.client_full_name, l.client_phone,
       l.loan_type, l.bank_assigned, 'missing_docs' as reason,
       array_agg(DISTINCT req.doc_name) FILTER (WHERE ld.id IS NULL) as missing_doc_names
FROM leads l
JOIN lender_doc_requirements req
  ON req.lender_code = l.bank_code AND req.loan_code = l.loan_type AND req.mandatory = true
LEFT JOIN lead_documents ld
  ON ld.lead_id = l.id AND ld.type = req.doc_name AND ld.status != 'rejected'
  -- NOTE: join on doc_name not doc_id (verified against live data)
LEFT JOIN reminder_log rl
  ON rl.lead_id = l.id AND rl.sent_at > NOW() - INTERVAL '3 days'
WHERE l.status NOT IN ('disbursed', 'rejected', 'draft') AND rl.id IS NULL
GROUP BY l.id, l.partner_org_id, l.client_full_name, l.client_phone, l.loan_type, l.bank_assigned
HAVING COUNT(DISTINCT req.doc_id) FILTER (WHERE ld.id IS NULL) > 0

UNION ALL

-- Branch 2: stalled leads, no reminder in past 3 days
SELECT l.id, l.partner_org_id, l.client_full_name, l.client_phone,
       l.loan_type, l.bank_assigned, 'stalled' as reason, NULL
FROM leads l
LEFT JOIN reminder_log rl ON rl.lead_id = l.id AND rl.sent_at > NOW() - INTERVAL '3 days'
WHERE l.status NOT IN ('disbursed', 'rejected', 'draft')
  AND l.updated_at < NOW() - INTERVAL '7 days' AND rl.id IS NULL
```
Dedupe in application code: if a `lead_id` appears in both branches, keep the `missing_docs` row only — one reminder per lead per batch.

### 6.2 — Create `src/jobs/whatsappReminders.ts`

Cron: `REMINDER_CRON_SCHEDULE` env (default `0 9 * * *`). Enabled by `ENABLE_REMINDER_JOB=true`.

Core function `runReminderBatch()`:
1. `getLeadsDueForReminder()` → deduped list
2. For each target: `hasWhatsappConsent(leadId, partnerOrgId)` → skip if false
3. Pick template: `missing_docs → document_reminder`, `stalled → status_update`
4. `sendWhatsappMessage(...)` via existing `src/lib/whatsapp.ts`
5. `logReminder(...)` to `reminder_log`

Provide **both** trigger paths:
- `node-cron` scheduler inside `whatsappReminders.ts` — for long-running server deployments
- `POST /api/webhooks/reminder-cron` with `x-reminder-secret` header validation — for Vercel/serverless where `node-cron` does not survive between invocations (same pattern as the existing `/api/webhooks/briefing-cron`)

Both paths call the same `runReminderBatch()`.

### 6.3 — Add env vars
```env
ENABLE_REMINDER_JOB=false
REMINDER_CRON_SCHEDULE=0 9 * * *
REMINDER_WEBHOOK_SECRET=your_secret_here
```

### 6.4 — Tests

`src/tests/whatsapp-reminders.test.ts`:
- Leads reminded within 3 days are excluded
- `status = 'disbursed'` leads are never targeted
- Lead in both branches gets only one reminder (missing_docs wins)
- Consent false → skipped, not sent
- `logReminder` writes a row

---

## Phase 7: Morning Briefing with WhatsApp Delivery

Phase 1.7 already wired `briefingGenerator.ts` to PostgreSQL. This phase completes the feature.

### 7.1 — On-demand summary via partner copilot

When partner asks "summarise my day" or "what should I focus on":
- CRM agent calls the existing `generateBriefing` tool
- `generateMorningBriefing(partnerOrgId)` now reads from PostgreSQL (Phase 1.7)
- Returns a concise inline summary (not the full JSON)

### 7.2 — Proactive briefing content

Add to `generateMorningBriefing` before Gemini synthesis:
- Stalled count: `getStalledLeads(partnerOrgId, 5)` length
- Documents pending review: `getLeadsWithMissingDocs` length  
- Commission being processed: sum where `commission_status = 'processing'`

Pass all three into the Gemini synthesis prompt so the briefing includes specific action items.

### 7.3 — Scheduled morning delivery

`/api/webhooks/briefing-cron` already exists and uses `fetchPartnerContacts` from gpsBridge. Replace with:
```typescript
// SELECT id, owner_user_id FROM partners WHERE status = 'active'
getAllActivePartners(): Promise<{ id: string }[]>   // add to adminDb.ts
```
Keep the rest of the webhook logic unchanged.

---

## Phase 8: Security — Knowledge Routes

Knowledge management routes are unauthenticated. Any caller who knows a `botId` can inject or delete knowledge.

- [ ] `POST /api/knowledge/upload`: add `getSession()`, verify `bot.ownerId === session.user.id`
- [ ] `POST /api/knowledge/text`: same
- [ ] `GET /api/knowledge/[botId]`: same
- [ ] `DELETE /api/knowledge/[botId]`: same
- [ ] Extract `src/lib/requireBotOwner.ts`: `requireBotOwner(botId) → IBot | errorResponse`
- [ ] Tests: unauthenticated → 401, wrong owner → 403, correct owner → 200

---

## Environment Variables

```env
# GPS India PostgreSQL — primary database
DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres

# Feature flags
ENABLE_WHATSAPP=false
ENABLE_SOFT_CHECK=true
ENABLE_MORNING_BRIEF=false
ENABLE_REMINDER_JOB=false
REMINDER_CRON_SCHEDULE=0 9 * * *
REMINDER_WEBHOOK_SECRET=

# GPS India external API (only escalation webhook after Phase 5)
GPS_INDIA_API_URL=
GPS_INDIA_WEBHOOK_URL=
```

---

## What to Leave Alone

- `DemoCrmRepository` + `demo-data.ts` — keep as fallback when `DATABASE_URL` is not set
- `src/model/Bot.ts`, `ChatSession.ts`, `KnowledgeChunk.ts`, `KnowledgeSource.ts` — still used
- `src/lib/whatsapp.ts` — sending logic is correct; only the consent check updates in Phase 5
- `src/lib/documentAnalyser.ts` + `analyseDocument.ts` tool — correct, leave for later
- `src/lib/softCheckEngine.ts` — correct, leave for later
- `public/widget.js` — production embed widget
- `public/chatBot.js` — legacy, do not use for new work

## Known Constraints

- `pg` is Node.js only. Any file importing `pgClient.ts`, `loanDb.ts`, `crmDb.ts`, or `adminDb.ts` must set `export const runtime = 'nodejs'`.
- Always filter `leads` with `WHERE partner_org_id = $1`. Never rely on RLS from the AI layer.
- Never SELECT `client_pan_number` or `client_aadhaar` — encrypted fields, must not reach the model.
- `supported_loan_types` is `text[]`. Query with `WHERE $1 = ANY(supported_loan_types)`.
- `lead_documents.type` stores the human-readable `doc_name`, not the `doc_id` slug. Join on `doc_name`.
- The real database is Prisma-managed by the GPS website backend. New tables (e.g. `reminder_log`) must be added as standalone SQL migration files and the GPS backend team notified to avoid drift.
