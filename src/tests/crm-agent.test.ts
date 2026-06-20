vi.mock("@/lib/gemini", () => ({
  generateWithTools: vi.fn(),
}))

vi.mock("@/agents/crm/tools/sendWhatsapp", () => ({ sendWhatsapp: vi.fn() }))
vi.mock("@/agents/crm/tools/analyseDocument", () => ({ analyseDocument: vi.fn() }))
vi.mock("@/agents/crm/tools/runSoftCheck", () => ({ runSoftCheck: vi.fn() }))
vi.mock("@/agents/crm/tools/generateBriefing", () => ({ generateBriefing: vi.fn() }))
vi.mock("@/agents/crm/tools/addPartnerNote", () => ({ addPartnerNote: vi.fn() }))
vi.mock("@/agents/crm/tools/queryPipeline", () => ({ queryPipeline: vi.fn() }))
vi.mock("@/agents/crm/tools/getCommissions", () => ({ getCommissions: vi.fn() }))
vi.mock("@/lib/loanAnswering", () => ({ answerLoanQuestion: vi.fn() }))

import { runCrmAgent } from "@/agents/crm/agent"
import { generateWithTools } from "@/lib/gemini"
import { queryPipeline } from "@/agents/crm/tools/queryPipeline"
import { answerLoanQuestion } from "@/lib/loanAnswering"

const mockGenerateWithTools = vi.mocked(generateWithTools)
const mockQueryPipeline = vi.mocked(queryPipeline)
const mockAnswerLoanQuestion = vi.mocked(answerLoanQuestion)

const partner = {
  userId: "u1",
  partnerId: "p1",
  partnerName: "Partner One",
  partnerTier: "gold",
  token: "jwt",
}

describe("runCrmAgent", () => {
  it("returns final text when model replies without tools", async () => {
    mockGenerateWithTools.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: "Here is your pipeline summary." }] } }],
    } as never)

    const result = await runCrmAgent("hello", [], partner)

    expect(result.text).toContain("pipeline summary")
    expect(result.iterations).toBe(1)
  })

  it("executes tool calls then returns model text", async () => {
    mockQueryPipeline.mockResolvedValue({ snapshot: { totalActiveLeads: 2 } } as never)

    mockGenerateWithTools
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "query_pipeline", args: {} } }],
            },
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        candidates: [{ content: { parts: [{ text: "You have 2 active leads." }] } }],
      } as never)

    const result = await runCrmAgent("how many leads", [], partner)

    expect(mockQueryPipeline).toHaveBeenCalledOnce()
    expect(result.text).toContain("2 active leads")
    expect(result.toolsUsed).toContain("query_pipeline")
  })

  it("can answer general loan questions through the shared loan knowledge tool", async () => {
    mockAnswerLoanQuestion.mockResolvedValueOnce({
      source: "postgres",
      marking: "Source: GPS India database",
      data: { loanType: "personal_loan", count: 3 },
    })

    mockGenerateWithTools
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "search_loan_knowledge", args: { query: "personal loan rates" } } }],
            },
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        candidates: [{ content: { parts: [{ text: "I found personal loan rates." }] } }],
      } as never)

    const result = await runCrmAgent("personal loan rates", [], partner)

    expect(mockAnswerLoanQuestion).toHaveBeenCalledWith({ query: "personal loan rates" })
    expect(result.toolsUsed).toContain("search_loan_knowledge")
  })
})
