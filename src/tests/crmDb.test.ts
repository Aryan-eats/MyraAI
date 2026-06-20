vi.mock("@/lib/pgClient", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  hasPostgres: vi.fn(() => true),
}))

import { query, queryOne } from "@/lib/pgClient"
import {
  getPipelineSummary,
  getCommissionSummary,
  resolveLeadByClientName,
  hasWhatsappConsent,
  resolvePartnerOrgForUser,
} from "@/lib/crmDb"

const mockQuery = vi.mocked(query)
const mockQueryOne = vi.mocked(queryOne)

describe("crmDb", () => {
  it("getPipelineSummary assembles byStatus map and totals", async () => {
    mockQuery.mockResolvedValueOnce([
      { status: "docs_pending", count: "9" },
      { status: "disbursed", count: "2" },
    ] as never)
    mockQueryOne.mockResolvedValueOnce({
      total: "11",
      active: "9",
      stalled: "6",
      pending_commission: "0",
      total_disbursed: "500000",
    } as never)

    const result = await getPipelineSummary("org1")

    expect(result.byStatus.docs_pending).toBe(9)
    expect(result.byStatus.disbursed).toBe(2)
    expect(result.totalLeads).toBe(11)
    expect(result.stalledLeads).toBe(6)
    expect(result.totalDisbursed).toBe(500000)
  })

  it("getCommissionSummary buckets rows by commission_status and ignores null", async () => {
    mockQuery.mockResolvedValueOnce([
      { commission_status: "pending", cnt: "3", amt: "1500" },
      { commission_status: "paid", cnt: "1", amt: "800" },
      { commission_status: null, cnt: "5", amt: "0" },
    ] as never)

    const result = await getCommissionSummary("org1")

    expect(result.pending).toBe(1500)
    expect(result.pendingCount).toBe(3)
    expect(result.paid).toBe(800)
    expect(result.processing).toBe(0)
  })

  it("resolveLeadByClientName returns multiple matches and scopes by partner", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        id: "l1",
        client_full_name: "Priya Sharma",
        client_phone: "999",
        loan_type: "home_loan",
        loan_amount: "100",
        status: "submitted",
        bank_assigned: null,
        commission_status: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "l2",
        client_full_name: "Priya Verma",
        client_phone: "888",
        loan_type: "personal_loan",
        loan_amount: "50",
        status: "submitted",
        bank_assigned: null,
        commission_status: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ] as never)

    const result = await resolveLeadByClientName("org1", "Priya")

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["org1", "%Priya%"])
    expect(result).toHaveLength(2)
  })

  it("resolveLeadByClientName returns empty for blank input without querying", async () => {
    const result = await resolveLeadByClientName("org1", "   ")
    expect(result).toEqual([])
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it("hasWhatsappConsent is true when an active grant row exists, false otherwise", async () => {
    mockQueryOne.mockResolvedValueOnce({ id: "c1" } as never)
    expect(await hasWhatsappConsent("l1", "org1")).toBe(true)

    mockQueryOne.mockResolvedValueOnce(null)
    expect(await hasWhatsappConsent("l1", "org1")).toBe(false)
  })

  it("resolvePartnerOrgForUser returns null when user maps to no active org", async () => {
    mockQueryOne.mockResolvedValueOnce(null)
    const result = await resolvePartnerOrgForUser("u-unknown")
    expect(result).toBeNull()
  })

  it("resolvePartnerOrgForUser returns the org scope when matched", async () => {
    mockQueryOne.mockResolvedValueOnce({
      partner_org_id: "org1",
      name: "Acme DSA",
      status: "active",
    } as never)
    const result = await resolvePartnerOrgForUser("u1")
    expect(result).toEqual({ partnerOrgId: "org1", name: "Acme DSA", status: "active" })
  })
})
