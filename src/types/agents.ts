export type LoanProductType =
  | "personal_loan"
  | "home_loan"
  | "lap"
  | "business_loan"
  | "vehicle_loan"
  | "education_loan"

export type ProductDocumentRequirement = {
  salaried: string[]
  selfEmployed: string[]
}

export type LendingProduct = {
  productType: LoanProductType
  lenderName: string
  interestRateMin: number
  interestRateMax: number
  processingFeePercent: number
  processingFeeFixed?: number
  minLoanAmount: number
  maxLoanAmount: number
  minTenureMonths: number
  maxTenureMonths: number
  tatDays: number
  minCibilScore: number
  minMonthlyIncome: number
  documentsRequired: ProductDocumentRequirement
  eligibilityCriteria: string
  prepaymentCharges: string
  specialFeatures: string[]
  lastUpdated: Date
  isActive: boolean
  needsVerification: boolean
}

export type KnowledgeFilters = {
  productType?: LoanProductType
  lenderName?: string
  maxInterestRate?: number
  minLoanAmount?: number
  maxProcessingFeePercent?: number
  salariedOnly?: boolean
  city?: string
}

export type KnowledgeSearchResult = LendingProduct & {
  confidence: number
}

export type GeminiRole = "user" | "model"

export type GeminiPart = {
  text?: string
  functionCall?: {
    name: string
    args?: Record<string, unknown>
  }
  functionResponse?: {
    name: string
    response: unknown
  }
  inlineData?: {
    mimeType: string
    data: string
  }
}

export type GeminiMessage = {
  role: GeminiRole
  content:
    | string
    | {
        parts: GeminiPart[]
      }
}

export type AgentResponse = {
  text: string
  toolsUsed: string[]
  iterations?: number
  leadCaptured?: boolean
  handoffRequired?: boolean
  data?: Record<string, unknown>
}

export type AuthenticatedPartner = {
  userId: string
  partnerId: string
  partnerName: string
  partnerTier: string
  token: string
}

export type ChatSessionSummary = {
  sessionId: string
  facts: string[]
  leadCaptured?: {
    name: string
    phone: string
  }
  analysedDocuments?: string[]
  notesAdded?: number
  endedAt: string
}

export type TemplateLanguage = "en" | "hi"

export type TemplateComponent = {
  type: "body"
  parameters: Array<{
    type: "text"
    text: string
  }>
}

export type WhatsappTemplateName =
  | "document_reminder"
  | "status_update"
  | "disbursement_alert"
  | "emi_reminder"
  | "morning_brief_partner"

export type WhatsappMessage = {
  to: string
  templateName: WhatsappTemplateName
  templateLanguage: TemplateLanguage
  components: TemplateComponent[]
  partnerId: string
  leadId?: string
}

export type WhatsappResult = {
  status: "sent" | "stubbed" | "blocked"
  providerMessageId?: string
  reason?: string
}

export type BulkResult = {
  sent: number
  failed: number
  blocked: number
  results: Array<{ to: string; result: WhatsappResult }>
}

export type DocumentType =
  | "salary_slip"
  | "bank_statement"
  | "itr"
  | "form_16"
  | "aadhaar"
  | "pan"
  | "property_documents"
  | "business_registration"
  | "gst_returns"

export type LenderChecklist = {
  lenderName: string
  productType: LoanProductType
  requiredFields: Array<{
    field: string
    required: boolean
    maxDocumentAgeDays?: number
  }>
}

export type DocumentAnalysisResult = {
  extractedData: Record<string, string>
  checklistStatus: {
    field: string
    required: boolean
    status: "present" | "missing" | "illegible" | "expired" | "mismatch"
    note?: string
  }[]
  overallStatus: "complete" | "incomplete" | "resubmit"
  issues: string[]
  partnerNote: string
}

export type SoftCheckResult = {
  leadId: string
  partnerId: string
  hardDisqualifier?: string
  foir: {
    current: number
    projected: number
    risk: "low" | "high" | "very_high"
  }
  ltv?: {
    ratio: number
    threshold: number
    status: "within_limit" | "above_limit"
  }
  lenderMatches: Array<{
    lenderName: string
    confidence: number
    criteriaMet: string[]
    criteriaMissed: string[]
  }>
  summary: string
  suggestedAction: string
  confidence: "high" | "medium" | "low"
  viable: boolean
}

export type Briefing = {
  partnerId: string
  date: string
  whatsappSummary: string
  inAppSections: {
    pipelineSnapshot: string
    priorityActions: string[]
    commissionUpdate: string
    riskFlags: string[]
  }
}

export type CrmToolCall = {
  name:
    | "send_whatsapp"
    | "analyse_document"
    | "run_soft_check"
    | "generate_briefing"
    | "add_partner_note"
    | "query_pipeline"
    | "get_commissions"
  args: Record<string, unknown>
}
