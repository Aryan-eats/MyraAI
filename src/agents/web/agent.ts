import { getWebSystemPrompt } from "@/agents/web/persona"
import { captureLead } from "@/agents/web/tools/captureLead"
import { checkEligibility } from "@/agents/web/tools/checkEligibility"
import { compareProducts } from "@/agents/web/tools/compareProducts"
import { searchKnowledge } from "@/agents/web/tools/searchKnowledge"
import { generateWithTools } from "@/lib/gemini"
import type { AgentResponse, GeminiMessage } from "@/types/agents"

function getWebToolDeclarations() {
  return [
    {
      name: "search_knowledge",
      description: "Search lending products, rates, fees and documentation requirements.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
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
      name: "compare_products",
      description: "Compare lenders for a product type.",
      parameters: {
        type: "object",
        properties: {
          productType: { type: "string" },
          amount: { type: "number" },
        },
        required: ["productType"],
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
    return searchKnowledge(String(args.query || ""))
  }
  if (name === "check_eligibility") {
    return checkEligibility({
      monthlyIncome: Number(args.monthlyIncome || 0),
      monthlyObligations: Number(args.monthlyObligations || 0),
      proposedEmi: Number(args.proposedEmi || 0),
    })
  }
  if (name === "compare_products") {
    return compareProducts({
      productType: String(args.productType || "personal_loan") as
        | "personal_loan"
        | "home_loan"
        | "lap"
        | "business_loan"
        | "vehicle_loan"
        | "education_loan",
      amount: typeof args.amount === "number" ? args.amount : undefined,
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
