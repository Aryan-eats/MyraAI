import { afterEach, describe, expect, it, vi } from "vitest"
import { captureLead } from "@/agents/web/tools/captureLead"

describe("captureLead", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.GPS_INDIA_API_URL
    delete process.env.GPS_INDIA_WEBHOOK_URL
    vi.restoreAllMocks()
  })

  it("creates a public lead through the GPS backend", async () => {
    process.env.GPS_INDIA_API_URL = "http://localhost:5000"
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { lead: { id: "lead-1" }, leadToken: "token-1" } }),
    } as never)

    const result = await captureLead({
      name: "Aryan Kumar",
      phone: "9999888812",
      loanType: "business_loan",
      loanAmount: 5000000,
      intentSummary: "Needs a business loan",
    })

    expect(global.fetch).toHaveBeenCalledWith("http://localhost:5000/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Aryan Kumar",
        phone: "9999888812",
        loanType: "business_loan",
        loanAmount: 5000000,
      }),
    })
    expect(result).toMatchObject({ captured: true, queued: true, leadId: "lead-1", leadToken: "token-1" })
  })
})
