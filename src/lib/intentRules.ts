export type ChatIntent =
  | "commission_status"
  | "loan_status"
  | "document_checklist"
  | "emi_schedule"
  | "lead_pipeline"
  | "general_faq"
  | "out_of_scope"

export type ToolName =
  | "get_commission_status"
  | "get_loan_status"
  | "get_document_checklist"
  | "get_emi_schedule"
  | "get_lead_pipeline"

export type IntentClassification = {
  intent: ChatIntent
  toolName: ToolName | null
  confidence: number
  params: Record<string, string>
}

type IntentRule = {
  pattern: RegExp
  intent: Extract<
    ChatIntent,
    "commission_status" | "loan_status" | "document_checklist" | "emi_schedule" | "lead_pipeline"
  >
  toolName: ToolName
  extractParams: (message: string) => Record<string, string>
}

const extractApplicationId = (message: string) => {
  const match = message.match(/\bAPP[\s-]?\d{3,}\b/i)
  return match?.[0].replace(/[\s-]/g, "").toUpperCase()
}

const extractLoanId = (message: string) => {
  const match = message.match(/\b(?:LOAN|LN)[\s-]?\d{3,}\b/i)
  return match?.[0].replace(/[\s-]/g, "").toUpperCase()
}

const extractPartnerId = (message: string) => {
  const match = message.match(/\b(?:PARTNER|DSA|PID)[\s-]?\d{2,}\b/i)
  return match?.[0].replace(/[\s-]/g, "").toUpperCase()
}

export const INTENT_RULES: IntentRule[] = [
  {
    pattern: /commission|payout|pending amount|earnings/i,
    intent: "commission_status",
    toolName: "get_commission_status",
    extractParams: (message) => {
      const periodMatch = message.match(
        /\b(this month|last month|current month|q[1-4]\s*\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i,
      )
      return {
        ...(extractPartnerId(message) ? { partnerId: extractPartnerId(message)! } : {}),
        ...(periodMatch ? { period: periodMatch[0] } : {}),
      }
    },
  },
  {
    pattern: /loan status|application status|when.*disburse|disbursement/i,
    intent: "loan_status",
    toolName: "get_loan_status",
    extractParams: (message) => ({
      ...(extractApplicationId(message) ? { applicationId: extractApplicationId(message)! } : {}),
    }),
  },
  {
    pattern: /document|what.*need|checklist|kyc/i,
    intent: "document_checklist",
    toolName: "get_document_checklist",
    extractParams: (message) => ({
      ...(extractApplicationId(message) ? { applicationId: extractApplicationId(message)! } : {}),
    }),
  },
  {
    pattern: /emi|repayment|installment|schedule/i,
    intent: "emi_schedule",
    toolName: "get_emi_schedule",
    extractParams: (message) => ({
      ...(extractLoanId(message) ? { loanId: extractLoanId(message)! } : {}),
    }),
  },
  {
    pattern: /lead|pipeline|client.*status/i,
    intent: "lead_pipeline",
    toolName: "get_lead_pipeline",
    extractParams: (message) => {
      const statusMatch = message.match(/\b(active|approved|disbursed|rejected|pending)\b/i)
      return {
        ...(extractPartnerId(message) ? { partnerId: extractPartnerId(message)! } : {}),
        ...(statusMatch ? { status: statusMatch[0].toLowerCase() } : {}),
      }
    },
  },
]

export function classifyByRules(message: string): IntentClassification | null {
  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(message)) {
      return {
        intent: rule.intent,
        toolName: rule.toolName,
        confidence: 0.95,
        params: rule.extractParams(message),
      }
    }
  }
  return null
}

