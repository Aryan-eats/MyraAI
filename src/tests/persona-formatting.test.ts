import { describe, expect, it } from "vitest"
import { getAdminChatbotPrompt } from "@/agents/admin/persona"
import { getCrmSystemPrompt } from "@/agents/crm/persona"
import { getPartnerChatbotPrompt } from "@/agents/partner/persona"
import { getWebSystemPrompt } from "@/agents/web/persona"

const expectedRule = "Format responses with short headings, bullet lists, or numbered next steps when it improves readability."
const partner = {
  userId: "user-1",
  partnerId: "partner-1",
  partnerName: "Test Partner",
  partnerTier: "standard",
  token: "token",
}
const admin = {
  userId: "admin-1",
  role: "admin",
  name: "Admin User",
  token: "token",
}

describe("agent personas", () => {
  it("ask agents for structured fintech responses", () => {
    expect(getWebSystemPrompt()).toContain(expectedRule)
    expect(getCrmSystemPrompt(partner)).toContain(expectedRule)
    expect(getPartnerChatbotPrompt(partner)).toContain(expectedRule)
    expect(getAdminChatbotPrompt(admin)).toContain(expectedRule)
  })
})
