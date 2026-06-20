vi.mock("@/lib/gemini", () => ({ generateWithTools: vi.fn() }))
vi.mock("@/lib/crmDb", () => ({
  getPipelineSummary: vi.fn(),
  getLeadsWithMissingDocs: vi.fn(),
  getStalledLeads: vi.fn(),
  getCommissionSummary: vi.fn(),
  getLeads: vi.fn(),
  getLeadById: vi.fn(),
  resolveLeadByClientName: vi.fn(),
}))
vi.mock("@/lib/loanAnswering", () => ({ answerLoanQuestion: vi.fn() }))

import { runPartnerChatbot } from "@/agents/partner/agent"
import { generateWithTools } from "@/lib/gemini"
import { getPipelineSummary, resolveLeadByClientName, getLeadById } from "@/lib/crmDb"
import { answerLoanQuestion } from "@/lib/loanAnswering"
import type { AuthenticatedPartner } from "@/types/agents"

const mockGenerate = vi.mocked(generateWithTools)
const mockGetPipelineSummary = vi.mocked(getPipelineSummary)
const mockResolveLead = vi.mocked(resolveLeadByClientName)
const mockGetLeadById = vi.mocked(getLeadById)
const mockAnswerLoanQuestion = vi.mocked(answerLoanQuestion)

const partner: AuthenticatedPartner = {
  userId: "u1",
  partnerId: "org1",
  partnerName: "Acme DSA",
  partnerTier: "standard",
  token: "t",
}

function toolCall(name: string, args: Record<string, unknown> = {}) {
  return { candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] } as never
}
function textReply(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] } as never
}

describe("runPartnerChatbot", () => {
  it("calls get_pipeline_overview and returns the model's text", async () => {
    mockGetPipelineSummary.mockResolvedValueOnce({
      byStatus: { docs_pending: 5 },
      totalLeads: 8,
      activeLeads: 6,
      stalledLeads: 6,
      pendingCommission: 0,
      totalDisbursed: 0,
    })
    mockGenerate.mockResolvedValueOnce(toolCall("get_pipeline_overview"))
    mockGenerate.mockResolvedValueOnce(textReply("You have 8 leads, 6 active."))

    const result = await runPartnerChatbot("how many leads do I have?", [], partner)

    expect(mockGetPipelineSummary).toHaveBeenCalledWith("org1")
    expect(result.toolsUsed).toContain("get_pipeline_overview")
    expect(result.text).toContain("8 leads")
  })

  it("resolves a client by name scoped to the partner org", async () => {
    mockResolveLead.mockResolvedValueOnce([
      {
        id: "l1",
        clientFullName: "Priya Sharma",
        clientPhone: "999",
        loanType: "home_loan",
        loanAmount: 100,
        status: "docs_pending",
        bankAssigned: "HDFC Bank",
        commissionStatus: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    mockGetLeadById.mockResolvedValueOnce({
      id: "l1",
      clientFullName: "Priya Sharma",
      clientPhone: "999",
      loanType: "home_loan",
      loanAmount: 100,
      status: "docs_pending",
      bankAssigned: "HDFC Bank",
      commissionStatus: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      clientCity: null,
      clientEmployment: null,
      clientIncome: null,
      sanctionedAmount: null,
      disbursedAmount: null,
      interestRate: null,
      tenure: null,
      documents: [],
      timeline: [],
    })
    mockGenerate.mockResolvedValueOnce(toolCall("get_lead_status", { name: "Priya" }))
    mockGenerate.mockResolvedValueOnce(textReply("Priya Sharma's home loan is in docs_pending."))

    const result = await runPartnerChatbot("what's Priya's status?", [], partner)

    expect(mockResolveLead).toHaveBeenCalledWith("org1", "Priya")
    expect(result.text).toContain("docs_pending")
  })

  it("degrades gracefully when the model call fails", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("llm down"))

    const result = await runPartnerChatbot("hi", [], partner)

    expect(result.text.length).toBeGreaterThan(10)
    expect(result.toolsUsed).toEqual([])
  })

  it("can answer general loan questions through the shared loan knowledge tool", async () => {
    mockAnswerLoanQuestion.mockResolvedValueOnce({
      source: "web_search",
      marking: "Source: Web search via Firecrawl",
      data: { query: "gold loan rules", results: [] },
    })
    mockGenerate.mockResolvedValueOnce(toolCall("search_loan_knowledge", { query: "gold loan rules" }))
    mockGenerate.mockResolvedValueOnce(textReply("Source: Web search via Firecrawl"))

    const result = await runPartnerChatbot("gold loan rules?", [], partner)

    expect(mockAnswerLoanQuestion).toHaveBeenCalledWith({ query: "gold loan rules" })
    expect(result.toolsUsed).toContain("search_loan_knowledge")
  })
})
