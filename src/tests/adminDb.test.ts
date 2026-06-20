vi.mock("@/lib/pgClient", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  hasPostgres: vi.fn(() => true),
}))

import { query, queryOne } from "@/lib/pgClient"
import { getPlatformSummary, getPartnerLeaderboard, getBankWiseStats } from "@/lib/adminDb"

const mockQuery = vi.mocked(query)
const mockQueryOne = vi.mocked(queryOne)

describe("adminDb", () => {
  it("getPlatformSummary maps aggregate strings to numbers", async () => {
    mockQueryOne.mockResolvedValueOnce({
      total_leads: "20",
      active_leads: "16",
      disbursals: "2",
      total_disbursed: "1250000",
      active_partners: "11",
    } as never)

    const result = await getPlatformSummary()

    expect(result.totalLeads).toBe(20)
    expect(result.activeLeads).toBe(16)
    expect(result.disbursals).toBe(2)
    expect(result.totalDisbursed).toBe(1250000)
    expect(result.activePartners).toBe(11)
  })

  it("getPartnerLeaderboard maps rows and forwards the limit", async () => {
    mockQuery.mockResolvedValueOnce([
      { partner_id: "p1", partner_name: "Top DSA", total_leads: "10", disbursals: "4", total_disbursed: "900" },
      { partner_id: "p2", partner_name: "Next DSA", total_leads: "8", disbursals: "1", total_disbursed: "100" },
    ] as never)

    const result = await getPartnerLeaderboard(5)

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [5])
    expect(result[0].partnerName).toBe("Top DSA")
    expect(result[0].disbursals).toBe(4)
    expect(result[1].totalLeads).toBe(8)
  })

  it("getBankWiseStats computes approval rate as a percentage", async () => {
    mockQuery.mockResolvedValueOnce([
      { bank_assigned: "HDFC Bank", total_leads: "6", approved_count: "3" },
      { bank_assigned: "SBI", total_leads: "0", approved_count: "0" },
    ] as never)

    const result = await getBankWiseStats()

    expect(result[0].approvalRate).toBe(50)
    expect(result[1].approvalRate).toBe(0)
  })
})
