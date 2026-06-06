export type CommissionEntry = {
  date: string
  leadId: string
  amount: number
  status: "pending" | "processing" | "credited"
}

export type CommissionStatus = {
  pending: number
  processing: number
  credited: number
  breakdown: CommissionEntry[]
}

export type LoanStatus = {
  stage: string
  lastUpdated: string
  nextAction: string
  rmContact: string
}

export type DocumentChecklist = {
  submitted: string[]
  pending: string[]
  rejected: string[]
}

export type EmiEntry = {
  dueDate: string
  principal: number
  interest: number
  amount: number
  status: string
}

export type EmiSchedule = {
  nextEmiDate: string
  nextEmiAmount: number
  outstandingPrincipal: number
  schedule: EmiEntry[]
}

export type LeadEntry = {
  leadId: string
  applicantName: string
  status: string
  amount?: number
  lastUpdated?: string
}

export type LeadPipeline = {
  leads: LeadEntry[]
  summary: {
    total: number
    active: number
    disbursed: number
  }
}

export type LeadProfile = {
  leadId: string
  partnerId: string
  applicantName: string
  phone: string
  age: number
  employmentType: "salaried" | "self_employed" | "unemployed" | "student"
  monthlyIncome: number
  monthlyObligations: number
  cibilScore?: number
  hasNpaFlag: boolean
  duplicateWithin90Days: boolean
  productType: "personal_loan" | "home_loan" | "lap" | "business_loan" | "vehicle_loan" | "education_loan"
  requestedLoanAmount: number
  proposedEmi?: number
  propertyValue?: number
}

export type PipelineSnapshot = {
  totalActiveLeads: number
  stalledOver7Days: number
  disbursementsPendingConfirmation: number
  byStatus: Array<{ status: string; count: number }>
}

export type TodaysAction = {
  leadId: string
  applicantName: string
  actionType: "document_gap" | "follow_up" | "emi_reminder"
  dueAt: string
  note: string
}

export type CommissionSnapshot = {
  pendingApproval: number
  estimatedCreditThisWeek: number
  monthToDate: number
}

export type RiskFlag = {
  leadId: string
  message: string
  severity: "low" | "medium" | "high"
}

export type PartnerContact = {
  partnerId: string
  partnerName: string
  partnerTier: string
  mobile: string
  isActive: boolean
}

export class GpsBridgeError extends Error {
  code: "AUTH_FAILED" | "ACCESS_DENIED" | "NOT_FOUND" | "SERVER_ERROR" | "NETWORK_ERROR" | "BAD_REQUEST"
  status?: number

  constructor(code: GpsBridgeError["code"], message: string, options?: { status?: number }) {
    super(message)
    this.code = code
    this.status = options?.status
    this.name = "GpsBridgeError"
  }
}

type RequestOptions = {
  token: string
  method?: "GET" | "POST"
  body?: Record<string, unknown>
}

type PartnerScopedOptions = RequestOptions & {
  authPartnerId: string
  targetPartnerId?: string
}

function assertPartnerScope(authPartnerId: string, targetPartnerId?: string) {
  if (targetPartnerId && authPartnerId !== targetPartnerId) {
    throw new GpsBridgeError("ACCESS_DENIED", "Cross-partner access is not allowed.", { status: 403 })
  }
}

async function gpsRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const baseUrl = process.env.GPS_INDIA_API_URL
  if (!baseUrl) {
    throw new GpsBridgeError("NETWORK_ERROR", "GPS_INDIA_API_URL is not configured.")
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    })
  } catch {
    throw new GpsBridgeError("NETWORK_ERROR", "Unable to reach GPS India backend.")
  }

  if (response.ok) {
    return (await response.json()) as T
  }

  if (response.status === 400) {
    throw new GpsBridgeError("BAD_REQUEST", "Invalid request for GPS India backend.", { status: 400 })
  }
  if (response.status === 401) {
    throw new GpsBridgeError("AUTH_FAILED", "Authentication failed.", { status: 401 })
  }
  if (response.status === 403) {
    throw new GpsBridgeError("ACCESS_DENIED", "Access denied for this resource.", { status: 403 })
  }
  if (response.status === 404) {
    throw new GpsBridgeError("NOT_FOUND", "Requested record not found.", { status: 404 })
  }

  throw new GpsBridgeError("SERVER_ERROR", "GPS India backend returned an error.", {
    status: response.status,
  })
}

// Existing API wrappers kept for backward compatibility.
export async function getCommissionStatus(
  params: { partnerId: string; period?: string },
  options: RequestOptions,
): Promise<CommissionStatus> {
  const query = params.period ? `?period=${encodeURIComponent(params.period)}` : ""
  return gpsRequest<CommissionStatus>(`/internal/partner/${params.partnerId}/commissions${query}`, options)
}

export async function getLoanStatus(params: { applicationId: string }, options: RequestOptions): Promise<LoanStatus> {
  return gpsRequest<LoanStatus>(`/internal/loan/${params.applicationId}/status`, options)
}

export async function getDocumentChecklist(
  params: { applicationId: string },
  options: RequestOptions,
): Promise<DocumentChecklist> {
  return gpsRequest<DocumentChecklist>(`/internal/loan/${params.applicationId}/documents`, options)
}

export async function getEmiSchedule(params: { loanId: string }, options: RequestOptions): Promise<EmiSchedule> {
  return gpsRequest<EmiSchedule>(`/internal/loan/${params.loanId}/emi-schedule`, options)
}

export async function getLeadPipeline(
  params: { partnerId: string; status?: string },
  options: RequestOptions,
): Promise<LeadPipeline> {
  const query = params.status ? `?status=${encodeURIComponent(params.status)}` : ""
  return gpsRequest<LeadPipeline>(`/internal/partner/${params.partnerId}/leads${query}`, options)
}

// New Myra CRM bridge wrappers with hard partner scope enforcement.
export async function fetchPartnerLeadProfile(
  partnerLeadId: string,
  options: PartnerScopedOptions,
): Promise<LeadProfile> {
  const lead = await gpsRequest<LeadProfile>(`/internal/partners/${options.authPartnerId}/leads/${partnerLeadId}`, options)
  assertPartnerScope(options.authPartnerId, lead.partnerId)
  return lead
}

export async function appendLeadPartnerNote(
  params: {
    leadId: string
    note: string
    visibility: "partner_only" | "visible_to_ops" | "visible_to_applicant"
  },
  options: PartnerScopedOptions,
): Promise<{ noteId: string }> {
  return gpsRequest<{ noteId: string }>(
    `/internal/partners/${options.authPartnerId}/leads/${params.leadId}/notes`,
    {
      token: options.token,
      method: "POST",
      body: {
        note: params.note,
        visibility: params.visibility,
      },
    },
  )
}

export async function fetchPartnerPipelineSnapshot(options: PartnerScopedOptions): Promise<PipelineSnapshot> {
  assertPartnerScope(options.authPartnerId, options.targetPartnerId)
  return gpsRequest<PipelineSnapshot>(`/internal/partners/${options.authPartnerId}/pipeline/snapshot`, options)
}

export async function fetchPartnerTodaysActions(options: PartnerScopedOptions): Promise<TodaysAction[]> {
  assertPartnerScope(options.authPartnerId, options.targetPartnerId)
  return gpsRequest<TodaysAction[]>(`/internal/partners/${options.authPartnerId}/pipeline/actions/today`, options)
}

export async function fetchPartnerCommissionSnapshot(options: PartnerScopedOptions): Promise<CommissionSnapshot> {
  assertPartnerScope(options.authPartnerId, options.targetPartnerId)
  return gpsRequest<CommissionSnapshot>(`/internal/partners/${options.authPartnerId}/commissions/snapshot`, options)
}

export async function fetchPartnerRiskFlags(options: PartnerScopedOptions): Promise<RiskFlag[]> {
  assertPartnerScope(options.authPartnerId, options.targetPartnerId)
  return gpsRequest<RiskFlag[]>(`/internal/partners/${options.authPartnerId}/pipeline/risk-flags`, options)
}

export async function fetchPartnerContacts(options: RequestOptions): Promise<PartnerContact[]> {
  return gpsRequest<PartnerContact[]>(`/internal/partners/active`, options)
}

export async function getClientWhatsappConsent(
  params: { partnerId: string; leadId: string },
  options: PartnerScopedOptions,
): Promise<{ consent: boolean; phone: string }> {
  assertPartnerScope(options.authPartnerId, params.partnerId)
  return gpsRequest<{ consent: boolean; phone: string }>(
    `/internal/partners/${params.partnerId}/leads/${params.leadId}/whatsapp-consent`,
    options,
  )
}

export async function logWhatsappEvent(
  payload: {
    partnerId: string
    leadId?: string
    to: string
    templateName: string
    status: string
    providerMessageId?: string
    reason?: string
  },
  options: PartnerScopedOptions,
): Promise<void> {
  assertPartnerScope(options.authPartnerId, payload.partnerId)
  await gpsRequest<{ ok: true }>(`/internal/partners/${payload.partnerId}/whatsapp/log`, {
    token: options.token,
    method: "POST",
    body: payload,
  })
}

export async function logDocumentAnalysis(
  payload: {
    partnerId: string
    leadId?: string
    documentType: string
    overallStatus: string
    timestamp: string
  },
  options: PartnerScopedOptions,
): Promise<void> {
  assertPartnerScope(options.authPartnerId, payload.partnerId)
  await gpsRequest<{ ok: true }>(`/internal/partners/${payload.partnerId}/document-analysis/log`, {
    token: options.token,
    method: "POST",
    body: payload,
  })
}

export async function savePartnerBriefing(
  payload: {
    partnerId: string
    date: string
    whatsappSummary: string
    inAppSections: Record<string, unknown>
  },
  options: PartnerScopedOptions,
): Promise<void> {
  assertPartnerScope(options.authPartnerId, payload.partnerId)
  await gpsRequest<{ ok: true }>(`/internal/partners/${payload.partnerId}/briefings`, {
    token: options.token,
    method: "POST",
    body: payload,
  })
}
