vi.mock("@/lib/gemini", () => ({ generateWithTools: vi.fn() }))
vi.mock("@/lib/pgClient", () => ({ hasPostgres: vi.fn(() => true) }))
vi.mock("@/lib/crmDb", () => ({ resolvePartnerOrgForUser: vi.fn() }))
vi.mock("@/lib/adminDb", () => ({
  ADMIN_ROLES: ["super_admin", "admin", "manager", "agent"],
  getUser: vi.fn(),
  getPlatformSummary: vi.fn(),
  getPartnerLeaderboard: vi.fn(),
  getBankWiseStats: vi.fn(),
  getLeadsByStatus: vi.fn(),
}))
vi.mock("@/lib/loanAnswering", () => ({ answerLoanQuestion: vi.fn() }))

import { NextRequest } from "next/server"
import { runAdminChatbot } from "@/agents/admin/agent"
import { requireAdminAuth, type AuthenticatedAdmin } from "@/lib/chatAuth"
import { generateWithTools } from "@/lib/gemini"
import { getPlatformSummary, getUser } from "@/lib/adminDb"
import { answerLoanQuestion } from "@/lib/loanAnswering"

const mockGenerate = vi.mocked(generateWithTools)
const mockGetPlatformSummary = vi.mocked(getPlatformSummary)
const mockGetUser = vi.mocked(getUser)
const mockAnswerLoanQuestion = vi.mocked(answerLoanQuestion)

const admin: AuthenticatedAdmin = { userId: "u1", role: "admin", name: "Ops", token: "t" }

function toolCall(name: string, args: Record<string, unknown> = {}) {
  return { candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] } as never
}
function textReply(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] } as never
}
function makeJwt(payload: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")
  return `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.`
}

describe("runAdminChatbot", () => {
  it("calls get_platform_overview and returns the model's text", async () => {
    mockGetPlatformSummary.mockResolvedValueOnce({
      totalLeads: 20,
      activeLeads: 16,
      disbursals: 2,
      totalDisbursed: 0,
      activePartners: 11,
    })
    mockGenerate.mockResolvedValueOnce(toolCall("get_platform_overview"))
    mockGenerate.mockResolvedValueOnce(textReply("The platform has 20 leads across 11 partners."))

    const result = await runAdminChatbot("how many leads total?", [], admin)

    expect(mockGetPlatformSummary).toHaveBeenCalled()
    expect(result.toolsUsed).toContain("get_platform_overview")
    expect(result.text).toContain("20 leads")
  })

  it("can answer general loan questions through the shared loan knowledge tool", async () => {
    mockAnswerLoanQuestion.mockResolvedValueOnce({
      source: "postgres",
      marking: "Source: GPS India database",
      data: { loanType: "home_loan", count: 1 },
    })
    mockGenerate.mockResolvedValueOnce(toolCall("search_loan_knowledge", { query: "home loan rates" }))
    mockGenerate.mockResolvedValueOnce(textReply("Home loan data is available."))

    const result = await runAdminChatbot("what are home loan rates?", [], admin)

    expect(mockAnswerLoanQuestion).toHaveBeenCalledWith({ query: "home loan rates" })
    expect(result.toolsUsed).toContain("search_loan_knowledge")
  })
})

describe("requireAdminAuth", () => {
  const originalFetch = global.fetch
  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.GPS_INDIA_API_URL
  })

  it("rejects a non-admin user", async () => {
    mockGetUser.mockResolvedValueOnce({ id: "u1", role: "partner", fullName: "P", isActive: true })
    const req = new NextRequest("http://localhost/api/chat/admin", {
      headers: { authorization: `Bearer ${makeJwt({ sub: "u1" })}` },
    })
    const result = await requireAdminAuth(req)
    expect(result).toBeNull()
  })

  it("accepts an admin-role user", async () => {
    mockGetUser.mockResolvedValueOnce({ id: "u9", role: "super_admin", fullName: "Boss", isActive: true })
    const req = new NextRequest("http://localhost/api/chat/admin", {
      headers: { authorization: `Bearer ${makeJwt({ sub: "u9" })}` },
    })
    const result = await requireAdminAuth(req)
    expect(result?.role).toBe("super_admin")
    expect(result?.userId).toBe("u9")
  })

  it("returns null when no token is present", async () => {
    const req = new NextRequest("http://localhost/api/chat/admin")
    const result = await requireAdminAuth(req)
    expect(result).toBeNull()
  })
})
