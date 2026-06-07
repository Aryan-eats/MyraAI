vi.mock("@/lib/gpsBridge", () => ({
  getClientWhatsappConsent: vi.fn(),
  logWhatsappEvent: vi.fn(),
}))

vi.mock("@/lib/chatCache", () => ({
  incrementRateLimitCounter: vi.fn(),
}))

import { sendWhatsappMessage } from "@/lib/whatsapp"
import { getClientWhatsappConsent, logWhatsappEvent } from "@/lib/gpsBridge"
import { incrementRateLimitCounter } from "@/lib/chatCache"

const mockConsent = vi.mocked(getClientWhatsappConsent)
const mockLog = vi.mocked(logWhatsappEvent)
const mockRate = vi.mocked(incrementRateLimitCounter)

describe("sendWhatsappMessage", () => {
  beforeEach(() => {
    process.env.ENABLE_WHATSAPP = "false"
    mockRate.mockResolvedValue(1)
    mockConsent.mockResolvedValue({ consent: true, phone: "919999999999" })
  })

  it("blocks when partner rate limit exceeds threshold", async () => {
    mockRate.mockResolvedValue(51)

    const result = await sendWhatsappMessage(
      {
        to: "+91 99999 99999",
        templateName: "status_update",
        templateLanguage: "en",
        components: [{ type: "body", parameters: [{ type: "text", text: "A" }] }],
        partnerId: "P1",
      },
      { token: "token", partnerId: "P1" },
    )

    expect(result.status).toBe("blocked")
    expect(mockLog).toHaveBeenCalled()
  })

  it("blocks when consent is missing", async () => {
    mockConsent.mockResolvedValue({ consent: false, phone: "919999999999" })

    const result = await sendWhatsappMessage(
      {
        to: "919999999999",
        templateName: "document_reminder",
        templateLanguage: "en",
        components: [{ type: "body", parameters: [{ type: "text", text: "A" }] }],
        partnerId: "P1",
        leadId: "L1",
      },
      { token: "token", partnerId: "P1" },
    )

    expect(result.status).toBe("blocked")
    expect(result.reason).toContain("opted in")
  })

  it("returns stubbed when feature flag disabled", async () => {
    const result = await sendWhatsappMessage(
      {
        to: "919999999999",
        templateName: "status_update",
        templateLanguage: "en",
        components: [{ type: "body", parameters: [{ type: "text", text: "A" }] }],
        partnerId: "P1",
      },
      { token: "token", partnerId: "P1" },
    )

    expect(result.status).toBe("stubbed")
  })
})
