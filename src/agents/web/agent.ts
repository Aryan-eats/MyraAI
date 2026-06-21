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
          loanType: { type: "string" },
          loanAmount: { type: "number" },
          email: { type: "string" },
          city: { type: "string" },
          employmentType: { type: "string" },
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
      loanType: args.loanType ? String(args.loanType) : undefined,
      loanAmount: typeof args.loanAmount === "number" ? args.loanAmount : undefined,
      email: args.email ? String(args.email) : undefined,
      city: args.city ? String(args.city) : undefined,
      employmentType: args.employmentType ? String(args.employmentType) : undefined,
      intentSummary: String(args.intentSummary || "website inquiry"),
    })
  }

  throw new Error(`Unsupported web tool: ${name}`)
}

function fallbackWebsiteReply() {
  return "I can help with loan products, eligibility, documentation, and next steps. Please share your loan type and approximate amount, and I will guide you."
}

function messageText(message: GeminiMessage) {
  if (typeof message.content === "string") {
    return message.content
  }
  return message.content.parts.map((part) => part.text ?? "").join(" ")
}

function detectResponseLanguage(message: string, conversationHistory: GeminiMessage[]) {
  if (/[\u0900-\u097F]/.test(message)) {
    return "Hindi"
  }

  const romanHindi =
    /\b(aap|aapko|apko|mujhe|mera|meri|mere|chahiye|chaiye|kya|kaise|kitna|kitni|loan ke|documents chahiye|ke baare|baare m|batao|sabse|ache|acche)\b/i
  if (romanHindi.test(message)) {
    return "Hinglish"
  }
  if (/[A-Za-z]/.test(message)) {
    return "English"
  }

  const recentText = conversationHistory.slice(-4).map(messageText).join(" ")
  if (/[\u0900-\u097F]/.test(recentText)) {
    return "Hindi"
  }
  if (romanHindi.test(recentText)) {
    return "Hinglish"
  }

  return "English"
}

function logWebAgentFailure(stage: string, error: unknown, details: Record<string, unknown> = {}) {
  console.error("[myra-web-agent]", stage, {
    error: error instanceof Error ? error.message : String(error),
    ...details,
  })
}

function summarizeToolResult(toolName: string, toolResult: unknown) {
  if (toolName === "compare_products") {
    const comparison = (toolResult as { comparison?: Array<Record<string, unknown>> }).comparison ?? []
    if (comparison.length) {
      return [
        "Loan options",
        "",
        ...comparison.map((item) => {
          const fee = item.processingFee ? `, processing fee: ${item.processingFee}` : ""
          return `- **${String(item.bankName)}:** ${String(item.rateRange)} interest${fee}`
        }),
      ].join("\n")
    }
  }

  if (toolName === "get_documents") {
    const result = toolResult as { available?: boolean; mandatoryDocs?: string[]; optionalDocs?: string[]; reason?: string }
    if (!result.available) {
      return result.reason || "I could not find a published document checklist for that bank and loan type."
    }
    return [
      "Documents required",
      "",
      "**Mandatory Documents:**",
      ...(result.mandatoryDocs ?? []).map((doc) => `- ${doc}`),
      "",
      "**Optional Documents:**",
      ...((result.optionalDocs?.length ? result.optionalDocs : ["None listed"]).map((doc) => `- ${doc}`)),
    ].join("\n")
  }

  return ""
}

export async function runWebAgent(
  message: string,
  conversationHistory: GeminiMessage[],
): Promise<AgentResponse> {
  const messages = [...conversationHistory, { role: "user" as const, content: message }]
  const systemInstruction = `${getWebSystemPrompt()}\nPreferred response language: ${detectResponseLanguage(message, conversationHistory)}.`

  let firstPass
  try {
    firstPass = await generateWithTools({
      systemInstruction,
      tools: [{ functionDeclarations: getWebToolDeclarations() }],
      messages,
      temperature: 0.1,
    })
  } catch (error) {
    logWebAgentFailure("first_pass_failed", error, {
      message,
      conversationTurns: conversationHistory.length,
    })
    return { text: fallbackWebsiteReply(), toolsUsed: [] }
  }

  const candidate = firstPass.candidates?.[0]
  if (!candidate?.content?.parts?.length) {
    console.error("[myra-web-agent]", "first_pass_empty", {
      message,
      conversationTurns: conversationHistory.length,
    })
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
  } catch (error) {
    logWebAgentFailure("tool_execution_failed", error, {
      toolName: toolCall.name,
      message,
    })
    const text = "I could not complete that action right now. I can still explain rates, docs, and eligibility if you share your loan type and amount."
    return { text, toolsUsed: [] }
  }

  let secondPass
  try {
    secondPass = await generateWithTools({
      systemInstruction,
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
  } catch (error) {
    logWebAgentFailure("second_pass_failed", error, {
      toolName: toolCall.name,
      message,
    })
    const text = summarizeToolResult(toolCall.name, toolResult)
    return {
      text: text || fallbackWebsiteReply(),
      toolsUsed: [toolCall.name],
      leadCaptured: toolCall.name === "capture_lead",
    }
  }

  const finalText = secondPass.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || ""
  const text = finalText || summarizeToolResult(toolCall.name, toolResult)

  if (!finalText) {
    console.error("[myra-web-agent]", "second_pass_empty", {
      toolName: toolCall.name,
      message,
    })
  }

  return {
    text: text || fallbackWebsiteReply(),
    toolsUsed: [toolCall.name],
    leadCaptured: toolCall.name === "capture_lead",
  }
}
