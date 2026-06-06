import { ChatIntent, ToolName } from "@/lib/intentRules"

export const GEMINI_TOOL_DECLARATIONS = [
  {
    name: "get_commission_status",
    description:
      "Fetch partner commission details including pending, processing, credited and line-item breakdown.",
    parameters: {
      type: "OBJECT",
      properties: {
        partnerId: {
          type: "STRING",
          description: "Unique partner ID in GPS India system.",
        },
        period: {
          type: "STRING",
          description: "Optional period such as 'this month', '2026-03', or 'Q1 2026'.",
        },
      },
      required: ["partnerId"],
    },
  },
  {
    name: "get_loan_status",
    description:
      "Fetch latest loan application status including stage, last updated, next action, and RM contact.",
    parameters: {
      type: "OBJECT",
      properties: {
        applicationId: {
          type: "STRING",
          description: "Loan application ID like APP001234.",
        },
      },
      required: ["applicationId"],
    },
  },
  {
    name: "get_document_checklist",
    description: "Fetch submitted, pending and rejected document lists for a loan application.",
    parameters: {
      type: "OBJECT",
      properties: {
        applicationId: {
          type: "STRING",
          description: "Loan application ID to fetch KYC/document checklist.",
        },
      },
      required: ["applicationId"],
    },
  },
  {
    name: "get_emi_schedule",
    description: "Fetch EMI schedule details, next EMI and outstanding principal.",
    parameters: {
      type: "OBJECT",
      properties: {
        loanId: {
          type: "STRING",
          description: "Loan account ID.",
        },
      },
      required: ["loanId"],
    },
  },
  {
    name: "get_lead_pipeline",
    description: "Fetch DSA partner lead pipeline and summary counts.",
    parameters: {
      type: "OBJECT",
      properties: {
        partnerId: {
          type: "STRING",
          description: "Partner ID whose leads should be fetched.",
        },
        status: {
          type: "STRING",
          description: "Optional status filter (active, disbursed, pending, rejected, approved).",
        },
      },
      required: ["partnerId"],
    },
  },
] as const

export const INTENT_CLASSIFIER_PROMPT = `
Classify the user message into exactly one intent.
Return JSON only with this schema:
{"intent": string, "toolName": string | null, "confidence": number, "params": object}

Valid intents:
- commission_status
- loan_status
- document_checklist
- emi_schedule
- lead_pipeline
- general_faq
- out_of_scope

Tool mapping:
- commission_status -> get_commission_status
- loan_status -> get_loan_status
- document_checklist -> get_document_checklist
- emi_schedule -> get_emi_schedule
- lead_pipeline -> get_lead_pipeline
- general_faq/out_of_scope -> null

Extract identifiers where present:
- applicationId
- loanId
- partnerId
- period
- status
- dateRange
`

export function isToolName(value: string): value is ToolName {
  return [
    "get_commission_status",
    "get_loan_status",
    "get_document_checklist",
    "get_emi_schedule",
    "get_lead_pipeline",
  ].includes(value)
}

export function toIntentSlug(intent: ChatIntent, params: Record<string, string>) {
  switch (intent) {
    case "commission_status":
      return `commission-status-${params.partnerId || "self"}-${params.period || "current"}`
    case "loan_status":
      return `loan-status-${params.applicationId || "unknown"}`
    case "document_checklist":
      return `document-checklist-${params.applicationId || "unknown"}`
    case "emi_schedule":
      return `emi-schedule-${params.loanId || "unknown"}`
    case "lead_pipeline":
      return `lead-pipeline-${params.partnerId || "self"}-${params.status || "all"}`
    case "general_faq":
      return "general-faq"
    default:
      return "out-of-scope"
  }
}

export function ttlForIntent(intent: ChatIntent) {
  if (intent === "commission_status") {
    return 1800
  }
  if (intent === "loan_status") {
    return 300
  }
  if (intent === "general_faq") {
    return 86400
  }
  return 300
}

