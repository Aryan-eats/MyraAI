export type ActorRole = "partner" | "admin"

export type AssistantActor = {
  userId: string
  role: ActorRole
  partnerId: string | null
}

export type ChatMessage = {
  role: "user" | "assistant"
  text: string
}

export type AssistantRequest = {
  message: string
  conversationId?: string
  sessionId?: string
  actor: AssistantActor
  conversation?: ChatMessage[]
}

export type AssistantAction = {
  label: string
  type: string
  payload: Record<string, unknown>
}

export type AssistantResponse = {
  answer: string
  intent: string
  conversationId: string
  reasoning: string[]
  data?: Record<string, unknown>
  actions?: AssistantAction[]
  memory?: {
    lastClientId?: string
    lastApplicationId?: string
  }
}

export type ClientRecord = {
  id: string
  partnerId: string
  fullName: string
  city: string
  employmentType: "salaried" | "self_employed"
  monthlyIncome: number
  existingEmi: number
  requestedLoanAmount: number
  cibilScore: number
  notes?: string[]
}

export type LoanApplicationRecord = {
  id: string
  clientId: string
  partnerId: string
  lenderName: string
  productType: string
  stage: string
  status: "active" | "approved" | "rejected" | "disbursed"
  requestedAmount: number
  sanctionedAmount?: number
  proposedEmi?: number
  missingDocuments: string[]
  lastActivityAt: string
  createdAt: string
  rejectionReason?: string
}

export type PartnerStatRecord = {
  partnerId: string
  month: string
  leads: number
  submitted: number
  approvals: number
  disbursals: number
  rejected: number
  docsPending: number
}

export type SemanticMemoryRecord = {
  id: string
  partnerId: string
  clientId?: string
  content: string
  summary: string
  tags: string[]
  createdAt: string
}

export type SessionMemory = {
  sessionId: string
  conversationId: string
  recentQueries: string[]
  lastClientId?: string
  lastApplicationId?: string
  lastIntent?: string
}

export type ToolExecutionResult = {
  toolName: string
  data: unknown
  summary: string
  reasoning: string[]
  recommendedActions?: AssistantAction[]
  memoryUpdate?: Partial<Pick<SessionMemory, "lastClientId" | "lastApplicationId" | "lastIntent">>
}

export type AssistantIntent =
  | "cases.pending"
  | "pipeline.docs_pending"
  | "partner.approval_insights"
  | "client.intelligence"
  | "client.details"
  | "case.update"
  | "client.create"
  | "general.greeting"
  | "general.identity"
  | "general.help"

export type ToolExecutionContext = {
  actor: AssistantActor
  session: SessionMemory
  now: Date
}

export type PlannerResult = {
  intent: AssistantIntent
  directAnswer?: string
  toolName:
    | "get_pending_cases"
    | "get_pending_documents"
    | "get_partner_stats"
    | "get_client_details"
    | "update_case_status"
    | "create_client"
    | "get_client_recommendation"
    | null
  arguments: Record<string, unknown>
  reasoning: string[]
}
