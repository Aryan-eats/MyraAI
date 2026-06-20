import { getWebSystemPrompt } from "@/agents/web/persona"
import { calculateEmi } from "@/agents/web/tools/calculateEmi"
import { captureLead } from "@/agents/web/tools/captureLead"
import { checkEligibility } from "@/agents/web/tools/checkEligibility"
import { compareProducts } from "@/agents/web/tools/compareProducts"
import { getDocuments } from "@/agents/web/tools/getDocuments"
import { searchKnowledge } from "@/agents/web/tools/searchKnowledge"
import { generateWithTools } from "@/lib/gemini"
import type { AgentResponse, GeminiMessage } from "@/types/agents"

function getWebToolDeclarations() {
  return [
    {
      name: "search_knowledge",
      description:
        "Look up loan products, interest rates, processing fees and turnaround time from GPS India's live lender database first. If the database has no useful match, this tool falls back to Firecrawl web search and returns marking='Source: Web search via Firecrawl'; include that marking in the answer.",
      parameters: {
        type: "object",
        properties: {
          loanType: { type: "string" },
          bankCode: { type: "string" },
          query: { type: "string" },
        },
        required: ["query"],
      },
    },
    {
      name: "compare_products",
      description: "Compare all banks offering a loan type, cheapest interest rate first. Pass loanType.",
      parameters: {
        type: "object",
        properties: {
          loanType: { type: "string" },
          amount: { type: "number" },
        },
        required: ["loanType"],
      },
    },
    {
      name: "get_documents",
      description:
        "Get the official document checklist for a specific bank and loan type. Pass bankCode (e.g. HDFC) and loanType (e.g. home_loan).",
      parameters: {
        type: "object",
        properties: {
          bankCode: { type: "string" },
          loanType: { type: "string" },
        },
        required: ["bankCode", "loanType"],
      },
    },
    {
      name: "calculate_emi",
      description:
        "Calculate the exact monthly EMI, total payable and total interest for a loan. Pass principalAmount (rupees), annualInterestRate (percent) and tenureMonths.",
      parameters: {
        type: "object",
        properties: {
          principalAmount: { type: "number" },
          annualInterestRate: { type: "number" },
          tenureMonths: { type: "number" },
        },
        required: ["principalAmount", "annualInterestRate", "tenureMonths"],
      },
    },
    {
      name: "check_eligibility",
      description: "Run rough FOIR-based eligibility estimate.",
      parameters: {
        type: "object",
        properties: {
          monthlyIncome: { type: "number" },
          monthlyObligations: { type: "number" },
          proposedEmi: { type: "number" },
        },
        required: ["monthlyIncome", "monthlyObligations", "proposedEmi"],
      },
    },
    {
      name: "capture_lead",
      description: "Capture a user lead after clear intent to apply.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          intentSummary: { type: "string" },
        },
        required: ["name", "phone", "intentSummary"],
      },
    },
  ]
}

async function executeWebTool(name: string, args: Record<string, unknown>) {
  if (name === "search_knowledge") {
    return searchKnowledge({
      loanType: args.loanType ? String(args.loanType) : undefined,
      bankCode: args.bankCode ? String(args.bankCode) : undefined,
      query: String(args.query || ""),
    })
  }
  if (name === "compare_products") {
    return compareProducts({
      loanType: String(args.loanType || args.productType || ""),
      amount: typeof args.amount === "number" ? args.amount : undefined,
    })
  }
  if (name === "get_documents") {
    return getDocuments({
      bankCode: String(args.bankCode || ""),
      loanType: String(args.loanType || ""),
    })
  }
  if (name === "calculate_emi") {
    return calculateEmi({
      principalAmount: Number(args.principalAmount || 0),
      annualInterestRate: Number(args.annualInterestRate || 0),
      tenureMonths: Number(args.tenureMonths || 0),
    })
  }
  if (name === "check_eligibility") {
    return checkEligibility({
      monthlyIncome: Number(args.monthlyIncome || 0),
      monthlyObligations: Number(args.monthlyObligations || 0),
      proposedEmi: Number(args.proposedEmi || 0),
    })
  }
  if (name === "capture_lead") {
    return captureLead({
      name: String(args.name || ""),
      phone: String(args.phone || ""),
      intentSummary: String(args.intentSummary || "website inquiry"),
    })
  }

  throw new Error(`Unsupported web tool: ${name}`)
}

function fallbackWebsiteReply() {
  return "I can help with loan products, eligibility, documentation, and next steps. Please share your loan type and approximate amount, and I will guide you."
}

export async function runWebAgent(
  message: string,
  conversationHistory: GeminiMessage[],
): Promise<AgentResponse> {
  const messages = [...conversationHistory, { role: "user" as const, content: message }]

  let firstPass
  try {
    firstPass = await generateWithTools({
      systemInstruction: getWebSystemPrompt(),
      tools: [{ functionDeclarations: getWebToolDeclarations() }],
      messages,
      temperature: 0.1,
    })
  } catch {
    return { text: fallbackWebsiteReply(), toolsUsed: [] }
  }

  const candidate = firstPass.candidates?.[0]
  if (!candidate?.content?.parts?.length) {
    return { text: "I am unable to respond right now.", toolsUsed: [] }
  }

  const toolCall = candidate.content.parts.find((p) => p.functionCall)?.functionCall
  if (!toolCall) {
    const text = candidate.content.parts.map((p) => p.text || "").join("").trim()
    return { text, toolsUsed: [] }
  }

  let toolResult: unknown
  try {
    toolResult = await executeWebTool(toolCall.name, toolCall.args || {})
  } catch {
    const text = "I could not complete that action right now. I can still explain rates, docs, and eligibility if you share your loan type and amount."
    return { text, toolsUsed: [] }
  }

  let secondPass
  try {
    secondPass = await generateWithTools({
      systemInstruction: getWebSystemPrompt(),
      tools: [{ functionDeclarations: getWebToolDeclarations() }],
      messages: [
        ...messages,
        {
          role: "model",
          content: {
            parts: [{ functionCall: toolCall }],
          },
        },
        {
          role: "user",
          content: {
            parts: [
              {
                functionResponse: {
                  name: toolCall.name,
                  response: toolResult,
                },
              },
            ],
          },
        },
      ],
    })
  } catch {
    return {
      text: fallbackWebsiteReply(),
      toolsUsed: [toolCall.name],
      leadCaptured: toolCall.name === "capture_lead",
    }
  }

  const finalText = secondPass.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || ""

  return {
    text: finalText || fallbackWebsiteReply(),
    toolsUsed: [toolCall.name],
    leadCaptured: toolCall.name === "capture_lead",
  }
}
