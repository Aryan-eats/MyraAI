# Loan-App AI Chatbot Implementation Plan

**Status:** Substantially implemented; production release gated  
**Date:** 2026-07-14  
**Owner:** Aryan  
**Scope:** Replace the current rule-based loan-app assistant with a loan-app-owned AI assistant, per-user WhatsApp Business reminders, guided CRM onboarding, and a governed admin control center. The loan-app backend owns auth, CRM data access, chat storage, messaging, consent, audit logging, and runtime chatbot controls. The old `agent` project is used only as source material.

## Implementation Status (2026-07-14)

Implementation is in `loan-app/.worktrees/chat-bot`. Runtime flags remain off by default. Database migrations are written and Prisma-valid but have not been applied to a production database.

| Area | Status | Notes |
|---|---|---|
| Integrated assistant runtime | Implemented | Gemini runtime, bounded history/tool loop, deployment allowlists/ceilings, deterministic fallback, scoped prompts, persistence, and redacted audit events. |
| Public loan expert | Implemented, data activation pending | EMI/eligibility/documents/lender matching, curated PostgreSQL knowledge search, safe lead capture, age refusal, and consent/version inputs are wired. The importer creates DRAFT knowledge; reviewed lender/knowledge data and final public notice wording must be approved before activation. |
| CRM business assistant | Implemented | Admin/partner-scoped lead search, pipeline metrics, documents/missing documents, timeline/follow-up context, commissions, soft-check context, and non-sending WhatsApp actions. |
| CRM document summarization | Implemented, disabled | Existing document authorization and redacted structured output are wired. Both deployment and active-policy flags must be enabled after Gemini document-handling approval. |
| WhatsApp per-user sender | Implemented, external activation pending | Embedded Signup exchange, encrypted credentials, approved templates, consent, test message, disconnect, quiet hours, rate limits, webhook verification, monotonic delivery state, redacted audit/timeline, contextual UI actions, and setup guide. Requires Meta App Review, approved templates, and production credentials. |
| WhatsApp send safety | Implemented | Destination and upload link are server-resolved. Send requires explicit confirmation and a five-minute single-use token bound to user, organization, lead, document, template version, hashed recipient, and reviewed variables. Client replies are discarded. |
| Chat storage/history/retention | Implemented, policy values pending | PostgreSQL conversations/messages, public session isolation, CRM scope checks, history reload, and dry-run-by-default cleanup exist. Exact public/CRM retention periods remain deliberately unset. |
| Admin control center | Implemented with conservative permissions | Metrics, transcript spectator view, config/persona/knowledge governance, WhatsApp/template controls, emergency stop, audit visibility, and maker-checker rollback drafts are wired. High-risk writes are super-admin-only until the final granular permission matrix is approved. |
| Verification | Passing locally | Prisma schema validation, backend/frontend production builds, 520 backend tests, and 65 frontend tests pass. Public widget desktop/mobile browser smoke passed. External Gemini/Meta delivery and production migration tests require credentials and approvals. |

Remaining release blockers are business/compliance decisions, reviewed production data, Meta/Gemini account approvals, the golden-question acceptance set, production migration/backup rehearsal, and end-to-end tests against approved external accounts. Do not enable `ASSISTANT_*`, document-analysis, or `WHATSAPP_ENABLED` production flags until the applicable gates are signed off.

---

## 1. Goal

Build one integrated chatbot inside `loan-app`:

| Mode | Where it appears | Auth | Data access |
|---|---|---|---|
| Public | Public website pages | None | Loan/bank/document/eligibility/EMI knowledge, lender matching, lead capture. No CRM data. |
| Partner CRM | `/partner/*` | Existing loan-app JWT | Partner-scoped leads, customers, documents, timelines, financials, commissions, and confirmed WhatsApp reminders from the user's connected business number. |
| Admin CRM | `/admin/*` | Existing loan-app JWT | Permission-scoped CRM data plus chatbot configuration, knowledge, personas, WhatsApp controls, metrics, audits, and transcripts. |

The chatbot should act as:

- public website: Indian bank loan expert
- CRM users: business partner for loan operations
- CRM workflow: contextual WhatsApp reminders for missing documents and application updates
- admin users: governed control and oversight of chatbot behavior, knowledge, messaging, cost, and access

Canonical storage is loan-app PostgreSQL via Prisma. No Mongo/Mongoose chat store, no separate chatbot auth, no shared JWT secret with another service.

---

## 2. Architecture Decision

Use the loan-app backend as the assistant backend:

```text
loan-app React
  -> loan-app backend POST /api/assistant/message
    -> existing auth middleware resolves public/partner/admin scope
    -> Prisma tools read scoped loan-app data
    -> LLM provider generates answer
    -> Prisma stores conversations, messages, metadata, and curated knowledge
    -> existing audit log records assistant messages and CRM tool access
    -> JSON response returns to widget

partner/admin React contextual WhatsApp action
  -> loan-app backend preview endpoint resolves authorized lead/document data
  -> CRM user reviews approved template variables and confirms
  -> loan-app backend sends from that user's connected WhatsApp Business number
  -> delivery-status webhook updates message event and audit log
```

Do not run `agent` as a long-term separate chat service. That boundary adds duplicated auth, duplicated storage, cross-service audit gaps, and harder PII controls.

---

## 3. Existing Loan-App Base

Already present in `loan-app/.worktrees/chat-bot`:

- Frontend widget:
  - `src/components/assistant/AssistantWidget.tsx`
  - `src/api/assistantApi.ts`
  - mounted in public, admin, and partner layouts
- Backend module:
  - `backend/src/modules/assistant/assistant.routes.ts`
  - `backend/src/modules/assistant/assistant.controller.ts`
  - `backend/src/modules/assistant/assistant.service.ts`
  - `backend/src/modules/assistant/assistant.tools.ts`
- Prisma base tables:
  - `AssistantConversation`
  - `AssistantMessage`
  - `AssistantScope`
  - `AssistantMessageRole`

These stay. Replace the rule-based service internals with LLM + scoped tools.

The loan app currently has MSG91 OTP/SMS support, but no WhatsApp Business sending service. It already has follow-up reminders, document assignment, secure upload links, lead phone data, permissions, consent infrastructure, and audit logging; reuse those paths.

---

## 4. Files To Port From `agent`

Port ideas/code selectively. Do not copy Next.js routes or Mongoose models as-is.

### 4.1 Public Loan Expert

Use these as source material for loan-app assistant tools/prompts:

```text
agent/src/agents/web/agent.ts
agent/src/agents/web/persona.ts
agent/src/agents/web/tools/calculateEmi.ts
agent/src/agents/web/tools/checkEligibility.ts
agent/src/agents/web/tools/compareProducts.ts
agent/src/agents/web/tools/getDocuments.ts
agent/src/agents/web/tools/searchKnowledge.ts
agent/src/agents/web/tools/captureLead.ts
agent/src/lib/loanAnswering.ts
agent/src/lib/loanTypes.ts
agent/src/lib/knowledgeBase.ts
```

Target:

```text
loan-app/backend/src/modules/assistant/assistant.prompts.ts
loan-app/backend/src/modules/assistant/tools/publicLoanTools.ts
loan-app/backend/src/modules/assistant/tools/calculationTools.ts
loan-app/backend/src/modules/assistant/tools/knowledgeTools.ts
loan-app/backend/src/modules/assistant/tools/leadTools.ts
```

Porting fidelity (accuracy protection):

- Port the agent-loop **semantics** from `web/agent.ts`, not just prompts: one bounded tool round, tool-failure fallback replies, `summarizeToolResult` degradation when the second pass fails, and Hindi/Hinglish/English response-language detection. The second pass receives no tool declarations.
- Port the matching test cases from `agent/src/tests/` (EMI math, FOIR/eligibility, compare-products, capture-lead, web-agent loop, persona formatting) alongside each tool.
- `searchKnowledge`'s Firecrawl web-search fallback is **dropped for v1** (uncontrolled web content in a regulated domain); the tool answers from the curated knowledge/product tables only.

Lead capture and public softcheck funnel (required):

- Extract the existing public lead creation logic into one shared loan-app service used by both `POST /api/leads` and `leadTools.captureLead`; do not call the HTTP route internally or duplicate its Prisma write.
- Ignore any public client-supplied `leadId`. Only the server may set `AssistantConversation.leadId`, after successful lead creation and recorded consent.
- A captured website lead remains admin-visible while assigned to the system partner. A partner transcript query must join the linked lead and require its current `partnerOrgId`; do not copy public-lead assignment into the conversation or trust client input. This makes reassignment take effect without synchronizing two ownership fields.
- Public lead capture must present and record the applicable privacy/consent notice version before linking the transcript. Store only an allowlisted soft-check summary in message metadata; never copy identity documents or unrestricted form payloads into metadata.

### 4.2 CRM Business Assistant

Use these as source material, rewritten against loan-app Prisma and existing auth scope:

```text
agent/src/agents/crm/agent.ts
agent/src/agents/crm/persona.ts
agent/src/agents/crm/tools/analyseDocument.ts
agent/src/agents/crm/tools/generateBriefing.ts
agent/src/agents/crm/tools/getCommissions.ts
agent/src/agents/crm/tools/queryPipeline.ts
agent/src/agents/crm/tools/runSoftCheck.ts
agent/src/agents/crm/tools/sendWhatsapp.ts
agent/src/agents/partner/agent.ts
agent/src/agents/partner/persona.ts
agent/src/agents/partner/tools/getCommissionOverview.ts
agent/src/agents/partner/tools/getLeadStatus.ts
agent/src/agents/partner/tools/getMissingDocsList.ts
agent/src/agents/partner/tools/getPipelineOverview.ts
agent/src/agents/partner/tools/getStalledLeadsList.ts
agent/src/lib/briefingGenerator.ts
agent/src/lib/documentAnalyser.ts
agent/src/lib/chatDocuments.ts
agent/src/lib/whatsapp.ts
```

Target:

```text
loan-app/backend/src/modules/assistant/tools/crmLeadTools.ts
loan-app/backend/src/modules/assistant/tools/documentTools.ts
loan-app/backend/src/modules/assistant/tools/commissionTools.ts
loan-app/backend/src/modules/assistant/tools/softCheckTools.ts
loan-app/backend/src/modules/whatsapp/whatsapp.service.ts
```

PDF/document summarization (`documentTools`) is **in v1** — it is a confirmed CRM requirement. CRM scope only; public sessions never accept uploads. The tool accepts an existing loan-app `documentId`, verifies lead/document access server-side, and reads through the existing document service. Reuse existing size, MIME, and magic-byte validation.

The donor `documentAnalyser` sends raw bytes to Gemini before redacting the result. Therefore v1 must explicitly require an approved provider data-retention/training policy before enabling this tool. Raw bytes may exist only transiently in memory, must never be logged or stored by the assistant, and only redacted structured fields may be saved. If provider handling is not approved, keep document analysis disabled while the rest of the CRM assistant ships.

### 4.3 WhatsApp Reminder Integration

Port only the donor's useful Meta API, consent, rate-limit, template, and audit behavior. Do not port its cross-service GPS bridge or Redis dependency.

Target:

```text
loan-app/backend/src/modules/whatsapp/whatsapp.routes.ts
loan-app/backend/src/modules/whatsapp/whatsapp.controller.ts
loan-app/backend/src/modules/whatsapp/whatsapp.service.ts
loan-app/backend/src/modules/whatsapp/whatsapp.types.ts
loan-app/src/api/whatsappApi.ts
loan-app/src/partner/components/WhatsappPreviewDialog.tsx
loan-app/src/partner/pages/WhatsappSetupPage.tsx
loan-app/src/partner/components/WhatsappSetupGuide.tsx
```

Backend endpoints:

```text
GET    /api/whatsapp/connection
POST   /api/whatsapp/connection/exchange           // exchange Embedded Signup code server-side
POST   /api/whatsapp/connection/disconnect         // revoke/disconnect authenticated user's sender
POST   /api/whatsapp/connection/test
POST   /api/whatsapp/preview                       // leadId + reminder type; server resolves recipient/data
POST   /api/whatsapp/send                          // short-lived preview token + permitted edited variables
POST   /api/whatsapp/consent                       // granted/withdrawn status, notice version, authenticated actor
GET    /api/whatsapp/webhook                       // Meta verification
POST   /api/whatsapp/webhook                       // verified delivery states; discard inbound message bodies
```

The preview endpoint returns a short-lived, single-use preview token bound to sender user, partner organization, lead, optional document, template version, and recipient hash. The send endpoint re-resolves and re-authorizes all records; it never accepts a destination phone number or upload URL from the browser.

Rules:

- each CRM user connects and verifies their own WhatsApp Business sender through Meta Embedded Signup
- the loan app exchanges and encrypts credentials server-side; tokens are never returned to the browser, logs, chatbot, or admin UI
- the sender is always the authenticated user's active `WhatsappConnection`; the client number is always resolved server-side from the authorized lead
- the LLM cannot send messages. It may identify missing items or draft allowed template variables, but only an explicit UI preview and confirmation calls the send endpoint
- outbound reminders always use an approved utility template. `Edit Message` changes only approved variables such as document names, advisor name, callback number, status note, and upload link
- no automatic or bulk sending in v1
- no client replies or personal WhatsApp conversations are ingested or stored. Webhooks retain only delivery states: queued, sent, delivered, read, failed, or blocked
- verify Meta webhook signatures, reject replay/unknown events, and make provider-message status updates idempotent; discard inbound message bodies before persistence or application logging
- every preview/send validates lead ownership, communication consent, template approval, sender status, phone format, rate limit, and quiet-hour policy
- every attempt writes a redacted message event and audit record; never store the access token, complete recipient number, or secure upload URL

Contextual entry points:

- `FollowUpReminders`: add a WhatsApp icon beside the existing navigation action for missing-document and status reminders
- document assignment: after assigning the required document list, show a WhatsApp action that prepares the assigned-document reminder
- partner/admin documents page: place a WhatsApp icon beside `Copy Upload Link`; confirmation generates a fresh time-limited link and sends it
- assistant response actions: when the CRM assistant identifies missing items, it may return `Prepare WhatsApp reminder`, which opens the same preview dialog without sending

CRM onboarding and help:

- after login, users without an active connection see a feature/setup guide explaining chatbot capabilities, WhatsApp Business requirements, Meta verification, consent, approved templates, editing limits, costs, and privacy
- setup is skippable so it cannot block unrelated CRM work; WhatsApp controls remain disabled with a `Connect WhatsApp` action
- the complete guide remains available under WhatsApp Settings and Help after onboarding
- show connection state (`not_connected`, `pending`, `active`, `action_required`, `disabled`) and a test-message step
- disconnect revokes loan-app access and disables sending without deleting immutable delivery/audit records

### 4.4 LLM Helper

Port the smallest useful provider layer:

```text
agent/src/lib/gemini.ts
agent/src/types/agents.ts
```

Target:

```text
loan-app/backend/src/modules/assistant/assistant.llm.ts
loan-app/backend/src/modules/assistant/assistant.types.ts
```

Keep it boring: Gemini first because the donor implementation already uses it. Do not port `llm/router.ts`; add routing only when a real second provider is approved.

### 4.5 Do Not Move

Skip these:

```text
agent/src/app/api/chat/**
agent/src/app/dashboard/**
agent/src/app/onboarding/**
agent/src/app/embed/**
agent/src/app/auth/**
agent/src/model/**
agent/src/lib/chatAuth.ts
agent/src/lib/apiSecurity.ts
agent/src/lib/db.ts
agent/src/lib/pgClient.ts
agent/src/lib/crmDb.ts
agent/src/lib/adminDb.ts
agent/src/lib/ScaleKit.ts
agent/src/lib/onboarding.ts
```

Loan-app already has Express routes, auth, Prisma, rate limiting, audit logs, and UI shells.

### 4.6 End State Of The `agent` Repo

After the port is verified (Phase 10 gate), the `agent` project is **frozen as a read-only donor**: tag the final commit (e.g. `pre-port-archive`), update its README to point here, and stop deploying it. Do not delete until the reviewed golden-question and production-compliance gates have passed for one release cycle.

---

## 5. Chat Storage In PostgreSQL

Use loan-app Postgres as the canonical store.

Existing tables stay:

```text
AssistantConversation
AssistantMessage
```

Add or extend:

```text
AssistantConversation.partnerOrgId  // nullable, for partner CRM scope
AssistantConversation.lead          // relation to Lead; server-controlled
AssistantConversation.partnerOrg    // relation to Partner; server-controlled
AssistantMessage.metadata           // already exists; use an allowlisted JSON shape
AuditEventType.ASSISTANT_TOOL        // use existing AuditLog for auditable tool calls
ChatbotKnowledgeSource              // curated loan/FAQ knowledge migrated in Phase 3
                                    // include sourceUrl, effectiveFrom, verifiedAt, active
ChatbotConfigVersion                // versioned enabled flags, allowlisted model, limits, escalation, freshness threshold
AssistantPersonaVersion             // versioned public/CRM prompts with approval and rollback
WhatsappConnection                  // one encrypted Meta connection per CRM user
WhatsappConsent                     // versioned lead-level WhatsApp opt-in/withdrawal history
WhatsappTemplate                    // canonical approved utility-template versions
WhatsappTemplateBinding             // per-connection Meta template name and approval status
WhatsappMessageEvent                // redacted send attempt and delivery status
```

Do not add `AssistantToolEvent` or chunk/vector tables in v1. Existing `AuditLog` covers tool access. Provider credentials remain deployment-controlled; encrypted per-user Meta credentials are stored only because individual sender connections require them. The curated knowledge set is small enough for ordinary PostgreSQL queries first.

ID hygiene: conversation and message IDs must be non-enumerable (UUID/cuid, which Prisma defaults provide). The browser-created public `sessionId` must be a valid UUID with a strict length limit. Public conversation reads require both `conversationId` and matching `sessionId`; neither value alone grants access.

Indexes:

```text
assistant_conversations(scope, created_at desc)
assistant_conversations(user_id, created_at desc)
assistant_conversations(session_id, created_at desc)
assistant_conversations(partner_org_id, created_at desc)
assistant_conversations(lead_id, created_at desc)
assistant_messages(conversation_id, created_at desc)
chatbot_knowledge_sources(active, verified_at desc)
assistant_persona_versions(scope, active, version desc)
chatbot_config_versions(status, version desc)
whatsapp_connections(user_id unique)
whatsapp_connections(partner_org_id, status)
whatsapp_consents(lead_id, granted_at desc)
whatsapp_template_bindings(connection_id, template_id unique)
whatsapp_message_events(sender_user_id, created_at desc)
whatsapp_message_events(lead_id, created_at desc)
whatsapp_message_events(provider_message_id unique)
```

Public users:

```text
scope = public
sessionId = browser assistantSessionId
userId = null
partnerOrgId = null
```

CRM users:

```text
scope = partner | admin
userId = authenticated user id
partnerOrgId = resolved partner org id for partner users
leadId = optional current lead context
```

Do not store full CRM row dumps in chat messages or audit logs. Store final answers plus allowlisted metadata: tool names, referenced entity IDs, model, token counts, latency, outcome, and safety flags. Audit and WhatsApp metadata must never contain unrestricted tool arguments/results, PAN, Aadhaar, account numbers, document contents, complete recipient numbers, Meta access tokens, or secure upload URLs.

---

## 6. Security And Data Access

All CRM tools must receive `AssistantContext`.

Rules:

- public scope cannot call CRM tools
- partner scope must filter by `partnerOrgId` and allowed ownership
- admin scope must use existing per-resource role/permission checks; `scope = admin` alone is not authorization
- LLM never gets raw unrestricted database access
- tool outputs are minimized before entering the prompt
- every CRM data lookup writes `ASSISTANT_TOOL` to the existing `AuditLog`, using redacted allowlisted metadata
- allowed tools are constructed server-side from scope and permissions; every tool validates its arguments and repeats authorization inside its Prisma query
- v1 permits at most one tool call per message; the final LLM pass receives no tool declarations
- tool outputs, document contents, partner notes, and customer free-text are untrusted data. Delimit and label them in the prompt, but rely on the server-side allowlist, argument validation, query scope, and one-tool limit as the security boundary

Request-boundary validation:

- ignore client-sent scope
- validate message length and validate `conversationId`, `sessionId`, and `leadId` as bounded UUIDs before database access
- ignore public client-sent `leadId`; set it only after server-side lead capture
- for CRM requests, accept lead context only after checking the authenticated user's permission and partner ownership
- reject unknown fields where practical and apply the existing assistant rate limiter

Use existing loan-app auth middleware and `resolvePartnerOrg`. No external JWT verification layer is needed.

PII handling:

- allow CRM assistant to summarize PII-heavy records only for authorized CRM users
- avoid repeating PAN/Aadhaar/full document contents unless the workflow explicitly needs it
- redact sensitive fields in logs and metadata
- never expose CRM data to public sessions
- audit admin transcript-detail views because transcripts may contain customer PII
- do not enable document analysis until the selected provider's document retention/training terms are approved

---

## 7. Regulatory And Compliance Gate

This section is an engineering release gate, not a substitute for advice from Indian privacy and financial-services counsel.

Applicable framework:

- Information Technology Act, 2000 and SPDI Rules, 2011: current privacy policy, purpose, consent, disclosure, retention, security, correction, and grievance obligations for sensitive data
- Digital Personal Data Protection Act, 2023 and Rules, 2025: phased commencement; build now for standalone notices, specific consent, easy withdrawal, rights, processor contracts, security, breach notice, and erasure before the core provisions take effect in May 2027
- CERT-In Directions dated 28 April 2022: synchronized clocks, designated point of contact, specified incident reporting within six hours, and ICT security logs retained in India for 180 days
- RBI Digital Lending Directions, 2025: applies where loan-app is an LSP/DLA for a regulated lender; requires need-based collection, explicit consent and audit trails, privacy controls, fair lender comparison, and India data-storage controls
- RBI KYC Directions/PMLA framework: KYC remains the regulated lender's controlled process; chatbot document extraction is not KYC verification
- Aadhaar Act and UIDAI regulations: lawful and voluntary use where applicable, permitted verification, masking, encryption, access control, and no unrestricted Aadhaar processing
- Consumer Protection Act, 2019 and CCPA misleading-advertisement/dark-pattern guidelines: no guarantees, disguised promotions, manipulated comparisons, or unfair nudging
- Meta WhatsApp Business terms: verified sender, opt-in, approved outbound utility templates, permitted variables, and provider rate/quality rules

Required controls:

- complete a written entity/data-role assessment: loan-app as DSA/LSP/DLA, each lender as RE, loan-app/provider roles as Data Fiduciary/Data Processor, and contractual responsibility for chatbot and WhatsApp processing
- maintain versioned, purpose-specific consent/notice records for chat storage, lead creation, LLM processing, document analysis, WhatsApp reminders, and any future bureau pull; withdrawal must be as easy as consent
- do not capture a public loan lead for a person under 18; provide an age declaration before personal-data collection
- visibly identify the chatbot as AI, label EMI/FOIR/eligibility output as estimates, provide human escalation, and never treat chatbot output as sanction, KFS, completed KYC, or an adverse credit decision
- lender comparisons must identify the regulated lender and show available APR, tenor, fees, material terms, source date, and grievance path without preferential ranking or dark patterns
- do not send PAN, full Aadhaar, account numbers, credentials, raw bureau data, or unrestricted documents to the LLM. Aadhaar displays are masked by default
- before Gemini receives any customer document/PII, approve the processor agreement, no-training/retention terms, processing region, India-localization compatibility, subprocessors, deletion, breach support, and lender/RE authorization
- provide access, correction, erasure/retention-exception, consent withdrawal, and grievance workflows for public and CRM-linked data
- maintain a retention matrix for chats, messages, documents, consents, WhatsApp events, audit records, and infrastructure logs; distinguish business records from CERT-In/DPDP security-log requirements
- maintain an incident runbook covering containment, evidence, the CERT-In six-hour deadline, affected-user notification, future DPDP Board notification, lender notification, and provider coordination
- do not access a credit-information report unless an authorized CIC integration, lender authorization, separate explicit consent, purpose limitation, and audit trail are implemented

Release gates:

- public non-PII FAQ/calculation pilot may run after accuracy, AI disclosure, source-date, and consumer-fairness tests pass
- lead capture requires approved notice/consent, age declaration, retention, grievance, and withdrawal flows
- CRM PII tools require role/tenant tests, processor contracts, field allowlists, and audited access
- document analysis remains disabled until provider, localization, lender, and document-consent approvals are recorded
- WhatsApp production sending remains disabled until Meta App Review/permissions, per-user onboarding, approved templates, communication consent, opt-out, credential protection, and delivery auditing pass

Primary references:

- MeitY DPDP Rules and commencement: `https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa`
- MeitY SPDI Rules: `https://www.meity.gov.in/sites/upload_files/dit/files/RNUS_CyberLaw_15411.pdf`
- CERT-In Directions: `https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf`
- RBI regulatory handbook/digital-lending summary: `https://website.rbi.org.in/documents/d/rbi/handbookg27022025d0f3f53f5d3c4310a6bb2f8ac2175d3a`
- UIDAI regulations: `https://uidai.gov.in/en/about-uidai/legal-framework/regulations.html`
- Consumer Protection rules/guidelines: `https://consumeraffairs.nic.in/acts-and-rules/consumer-protection/consumer-protection`
- Meta WhatsApp Business Platform: `https://www.postman.com/meta/whatsapp-business-platform/overview`

---

## 8. LLM Behavior

Add backend env:

```text
ASSISTANT_PROVIDER=gemini
ASSISTANT_MODEL=...                  # deployment default
ASSISTANT_MODEL_ALLOWLIST=...
GEMINI_API_KEY=...
ASSISTANT_MAX_OUTPUT_TOKENS=...      # hard deployment ceiling
ASSISTANT_MAX_INPUT_TOKENS=...       # hard deployment ceiling
ASSISTANT_TOOL_TIMEOUT_MS=...        # hard deployment ceiling
ASSISTANT_RATE_LIMIT_MAX=...
ASSISTANT_ESCALATION_TEXT=...
WHATSAPP_ENABLED=false
META_APP_ID=...
META_APP_SECRET=...
META_EMBEDDED_SIGNUP_CONFIG_ID=...
META_WEBHOOK_VERIFY_TOKEN=...
META_GRAPH_API_VERSION=...
```

Provider identity, credentials, model allowlist, and hard safety ceilings remain deployment-controlled. Admin configuration may select an allowlisted model and lower limits, enable/disable features, and activate approved persona versions; it cannot exceed deployment ceilings or read secrets.

`WHATSAPP_ENABLED` is the deployment kill switch. Admin may enable the runtime WhatsApp flag only when this deployment flag is true and all compliance approvals are recorded.

Prompts:

- Public prompt: Indian loan/banking expert, explain loan products, documents, eligibility, EMI/FOIR, process, and general financial guidance. Do not claim guaranteed approval or invent current bank policies.
- CRM prompt: loan operations business partner. Use only scoped tool data for customer facts. Find stuck leads, missing docs, summaries, follow-ups, eligibility gaps, EMI/compare answers.
- EMI, FOIR, eligibility, and other calculations come from deterministic tools; the LLM explains their output but does not calculate them itself.
- Bank rates, fees, policies, and document claims must include the curated record's source/effective or verification date. If the record is stale or missing, say that current information is unavailable and escalate.
- Financial guidance is educational and estimate-based, not a guarantee of approval or personalized investment, tax, or legal advice.

Flow per message:

1. Validate the complete request, authentication, conversation ownership, and optional CRM lead context.
2. Save user message.
3. Build bounded context from scope and recent history, capped by `ASSISTANT_MAX_INPUT_TOKENS`.
4. Build the allowed tool declarations from server-side scope and permissions.
5. Run the first LLM pass with a provider timeout.
6. If requested, validate and execute one allowed tool with scoped Prisma filters, row/output limits, and `ASSISTANT_TOOL` audit logging.
7. Run the final LLM pass with minimized tool data and no tool declarations.
8. Save the assistant message and allowlisted metadata.
9. Audit the assistant message.
10. Return one JSON response to the widget.

Fallback and escalation:

- if provider env is missing, return deterministic fallback for dev
- if LLM fails, save a friendly failure response and audit the error
- if the final LLM pass fails after a successful tool call, use a deterministic tool-result summary where available
- if the question is out of scope or the assistant cannot answer from tools/knowledge, use the active `ChatbotConfigVersion.escalationText` with `ASSISTANT_ESCALATION_TEXT` as deployment fallback — never invent bank policy. Tag message metadata `escalated: true` so metrics can count escalations.

---

## 9. Admin Chatbot Control Center

Console lives inside loan-app admin:

```text
/admin/chatbot
```

Add frontend pages/components under:

```text
loan-app/src/admin/pages/ChatbotPage.tsx
loan-app/src/admin/components/chatbot/*
```

Add backend endpoints under:

```text
GET    /api/admin/chatbot/metrics
GET    /api/admin/chatbot/conversations
GET    /api/admin/chatbot/conversations/:id
GET    /api/admin/chatbot/config
POST   /api/admin/chatbot/config/versions
POST   /api/admin/chatbot/config/versions/:id/approve
POST   /api/admin/chatbot/config/versions/:id/activate
POST   /api/admin/chatbot/config/versions/:id/rollback
GET    /api/admin/chatbot/personas
POST   /api/admin/chatbot/personas
POST   /api/admin/chatbot/personas/:id/approve
POST   /api/admin/chatbot/personas/:id/activate
POST   /api/admin/chatbot/personas/:id/rollback
GET    /api/admin/chatbot/knowledge
POST   /api/admin/chatbot/knowledge
PATCH  /api/admin/chatbot/knowledge/:id
POST   /api/admin/chatbot/knowledge/:id/approve
POST   /api/admin/chatbot/knowledge/:id/activate
POST   /api/admin/chatbot/knowledge/:id/archive
GET    /api/admin/chatbot/whatsapp/connections
POST   /api/admin/chatbot/whatsapp/connections/:id/disable
GET    /api/admin/chatbot/whatsapp/templates
POST   /api/admin/chatbot/whatsapp/templates
PATCH  /api/admin/chatbot/whatsapp/templates/:id
POST   /api/admin/chatbot/whatsapp/templates/:id/approve
POST   /api/admin/chatbot/whatsapp/templates/:id/activate
GET    /api/admin/chatbot/whatsapp/messages
```

Console views:

- Overview: conversations, messages, public/CRM split, leads captured, tool usage, errors, escalations, latency, tokens/cost, WhatsApp delivery/failure rates
- Conversations: transcript explorer with scope/user/lead/date filters, redacted PII, tool references, model/persona version, and audited detail reads
- Controls: public/CRM enable flags, global emergency stop, allowlisted model, token/input limits, tool timeout, freshness threshold, escalation text, and WhatsApp global enable/quiet hours/rate limits
- Personas: draft, compare, test against the golden set, approve, activate, version history, and rollback for public and CRM prompts
- Knowledge: create/update/archive sourced FAQ and loan guidance, with source URL, effective date, verified date, owner, and stale-content alerts
- WhatsApp: connected-user status, masked sender number, template bindings/approval, send/delivery failures, per-user disable, global stop, and cost/volume metrics
- Compliance/Audit: consent versions, provider approval status, retention-job status, access/mutation audit events, and export through the existing audit-log path

Control rules:

- `super_admin` owns high-risk writes; permissions may grant admins read/operational access without granting prompt/model/template activation
- persona, model, lender-data, retention, and WhatsApp-template activation use maker-checker approval, version history, effective actor/time, audit, and rollback
- every mutation validates an allowlist server-side; the browser never sends arbitrary provider IDs, tool names, database fields, or template status
- emergency stop is immediate and does not require maker-checker approval; re-enabling does
- admin transcript and message views remain tenant/role controlled and redact sensitive identifiers
- approved WhatsApp templates cannot be freely rewritten. Admin edits create a new draft/version that must pass Meta approval and internal approval before activation

Never expose or runtime-edit:

- database URLs, JWT/auth secrets, Gemini/Meta API secrets, or per-user Meta access tokens
- CORS/deployment/network security settings
- unmasked PAN/Aadhaar/account numbers
- client WhatsApp replies or CRM users' personal conversations, because they are not collected
- immutable audit records or consent history

---

## 10. Phase Plan

### Phase 0 - Baseline And Commit The Scaffold

- Inspect the uncommitted assistant scaffold in `.worktrees/chat-bot` and confirm every changed file belongs to this feature.
- Run current loan-app backend/frontend tests.
- Record current assistant behavior.
- Confirm current AssistantConversation/AssistantMessage migration state.
- Commit the verified scaffold to the `chat-bot` branch before building on it; decide merge timing to `main` separately.
- Complete the legal/entity assessment in Section 7: DSA/LSP/DLA status, lender/RE responsibilities, Data Fiduciary/Processor roles, India-localization requirements, and contracts.
- Create the processing inventory and field allowlists for public chat, CRM tools, documents, Gemini, WhatsApp, transcripts, and audits.
- Approve versioned notices/consents, age declaration, retention matrix, grievance/rights workflow, and CERT-In/DPDP incident runbook.
- Start Meta App Review and Advanced Access for Embedded Signup and WhatsApp business-management/messaging permissions; production WhatsApp remains disabled until approval.
- Make the loan-app `banks` module authoritative for overlapping lender/product fields. Import only missing donor fields after an explicit field map; do not keep two live sources for the same field.
- Obtain approval for the selected provider's document retention/training terms and define the public-chat consent notice before enabling document analysis or transcript-to-lead linking.
- Build a **golden-question set** of 20-30 real loan questions covering rates, EMI, FOIR, documents, comparisons, Hinglish, prompt injection, and out-of-scope probes. Use the old agent only to source questions; expected criteria must come from deterministic calculations and dated, reviewed loan-app data.

Gate: tests pass; scaffold committed; legal/data roles and release gates signed off; Meta review submitted; consent, retention, incident, provider, and data-authority decisions recorded; golden set has reviewed criteria.

### Phase 1 - Schema

- Add `AssistantConversation.partnerOrgId` plus server-controlled relations to `Partner` and `Lead`.
- Keep the existing `AssistantMessage.metadata`; document and test its allowlisted shape instead of adding another payload store.
- Add `AuditEventType.ASSISTANT_TOOL` to the existing audit model.
- Add the flat `ChatbotKnowledgeSource` table with source/effective/verification dates and the indexes from Section 5.
- Add `ChatbotConfigVersion` and `AssistantPersonaVersion` with draft/approved/active states, actor, timestamps, and rollback lineage.
- Add `WhatsappConnection`, `WhatsappConsent`, `WhatsappTemplate`, `WhatsappTemplateBinding`, and `WhatsappMessageEvent` with encrypted credentials and redacted event fields from Section 5.
- Add assistant/WhatsApp/admin mutation audit event types to the existing audit model; do not create a second audit system.
- Add migration and focused schema tests.

Gate: Prisma generate/migrate clean; assistant route tests still pass.

### Phase 2 - LLM Provider

- Add `assistant.llm.ts`.
- Add env validation for Gemini, model, input/output limits, tool timeout, and escalation text.
- Add bounded history construction, server-side tool allowlisting, one-tool execution, and a final pass with no tool declarations.
- Resolve active configuration/persona from approved database versions while enforcing deployment model allowlists and hard ceilings.
- Keep deterministic dev fallback when provider is unset.

Gate: focused tests prove the LLM path receives bounded context, cannot execute a second tool call, times out cleanly, and falls back without provider configuration.

### Phase 3 - Knowledge Data Migration + Public Expert Tools

- **Migrate the data the tools answer from** (blocking - the tools are useless without it):
  - map donor Postgres lender/product fields to the authoritative loan-app `banks` tables and import only missing rates, fees, and document-checklist fields;
  - migrate reviewed lending knowledge from the donor Mongo knowledge base and `KNOWLEDGE_BASE_SEED.md` into `ChatbotKnowledgeSource`, including source and verification dates;
  - add a re-runnable seed/import script.
- Port EMI, document guidance, eligibility explanation, lender matching, and flat-table knowledge search into Prisma-backed loan-app tools, preserving the bounded agent-loop semantics from Section 4.1.
- Extract public lead creation into one shared loan-app service, then use it from both the existing public route and `captureLead`. Record consent and link the conversation only after creation succeeds.
- Port the matching `agent` test cases for each tool.
- Replace public rule-only reply with LLM + tools.

Gate: the reviewed golden-question criteria pass; lender results include RE identity, APR/tenor/fees where available, source dates, AI/estimate disclosure, and no dark-pattern ranking; invalid/public-supplied lead IDs cannot link conversations; under-18 lead capture is refused; a captured lead appears to admin and becomes partner-visible only after authorized assignment; public CRM requests are refused.

### Phase 4 - CRM Tools

- Rewrite partner/admin CRM tools against loan-app Prisma:
  - search leads
  - get lead summary
  - missing documents
  - timeline/status summary
  - commissions
  - soft-check context
  - follow-up draft context
  - **PDF/document summarization** by authorized existing `documentId`; CRM only and enabled only after provider data-policy approval
- Enforce scope and resource permission inside every query, cap rows/tool-output size, and write a redacted `ASSISTANT_TOOL` audit event during execution.
- Port the matching `agent` test cases (soft-check engine, analyse-document redaction, commissions, pipeline).

Gate: partner cannot see another partner's data; lower admin roles cannot bypass resource permissions; document access rejects cross-tenant IDs; a CRM user gets a redacted PDF summary and raw document bytes/text never appear in messages, metadata, or logs.

### Phase 5 - Per-User WhatsApp Foundation And Guide

- Add Meta Embedded Signup callback/exchange, encrypted credential storage, connection health, test message, disconnect/revocation, and delivery-status webhook handling.
- Ignore and immediately discard inbound client message content; store only provider message IDs and delivery states.
- Add versioned WhatsApp consent/withdrawal, approved utility-template bindings, server-side lead-phone resolution, sender ownership, rate limits, quiet hours, and redacted audit events.
- Add the post-login feature/setup guide plus persistent WhatsApp Settings/Help covering chatbot features, requirements, account verification, consent, templates, edit limits, costs, privacy, and troubleshooting.
- Keep `WHATSAPP_ENABLED=false` until Meta permissions and compliance gates pass.

Gate: one CRM user can connect and test their own verified business sender; another user cannot use or inspect it; tokens never reach client/log/admin responses; inbound message bodies are discarded; disconnect blocks sending; guide remains accessible after setup.

### Phase 6 - Contextual WhatsApp Reminder UI

- Add the reusable preview dialog with client name, masked server-resolved number, sender, template, editable approved variables, cost/category notice, and explicit confirmation.
- Add the WhatsApp icon to `FollowUpReminders` for missing-document and status-update reminders.
- Add the WhatsApp action after document-list assignment.
- Add the WhatsApp icon beside `Copy Upload Link`; on confirmation, generate a fresh expiring link and send without storing the complete URL in event/audit metadata.
- Add `Prepare WhatsApp reminder` as a non-sending assistant action that opens the same dialog.
- Write send/delivery status to the lead timeline and admin metrics without storing client replies.

Gate: client number cannot be supplied or changed by the browser; cross-tenant sends fail; missing consent/unapproved template/disconnected sender/rate limit/quiet hours block sending; edit is limited to approved variables; no message sends before confirmation.

### Phase 7 - Chat History, Visibility, And Retention

- Add history endpoints needed by the widget. Public reads require matching `conversationId` and `sessionId`; CRM reads require authenticated ownership/scope.
- Apply lead-assignment visibility rules to transcript queries.
- Implement the approved public/CRM retention schedule; assistant audits follow the existing immutable audit-retention policy.

Gate: transcript survives refresh; anonymous and cross-tenant history access is denied; retention cleanup is tested; audit log shows assistant CRM access.

### Phase 8 - Frontend Widget Upgrade

- Keep current `AssistantWidget`.
- Load the authorized conversation history implemented in Phase 7 so transcripts survive refresh.
- Render actions/links cleanly.
- Keep public hidden on `/apply`; keep CRM widget in partner/admin layouts.

Gate: public, partner, admin flows work end to end.

### Phase 9 - Admin Control Center

- Add `/admin/chatbot`.
- Add overview, conversation explorer, controls, personas, knowledge, WhatsApp, and compliance/audit views from Section 9.
- Enforce separate read, draft, approve, activate, rollback, sender-disable, and emergency-stop permissions.
- Add maker-checker approval for high-risk activation, golden-set persona testing, mutation audits, effective versions, and rollback.
- Keep secrets, unmasked identifiers, client replies, and immutable consent/audit history inaccessible.

Gate: owner/super-admin can govern all approved runtime behavior and messaging controls; unauthorized roles are denied; high-risk changes cannot self-approve; emergency stop is immediate; every view/mutation is redacted and audited; rollback creates a lineage-linked draft that must pass maker-checker approval before activation.

### Phase 10 - Verification, Compliance, And Docs

- Run backend tests, frontend tests, and manual smoke.
- Update README/env docs.
- Test consent withdrawal, age refusal, data rights, retention deletion/exceptions, provider failure, cross-tenant access, audit integrity, WhatsApp opt-out, token leakage, webhook forgery, and emergency stops.
- Document consent, retention, provider document handling, PII behavior, data freshness, incident reporting, WhatsApp onboarding, admin governance, and operational escalation.
- Obtain compliance/owner sign-off against every Section 7 release gate before production flags are enabled.

Gate: ready for review.

---

## 11. Dependencies

Add only what is actually used:

```text
@google/genai      // single v1 provider
```

Use the loan-app's existing request-validation and document-upload utilities. Do not add `pdf-parse` when the approved Gemini document-input path handles the existing PDF directly; add it only if local text extraction becomes a measured requirement.

Use native `fetch` for Meta Graph API calls and the loan-app's existing encryption, rate-limit, auth, audit, and database helpers. Do not add a WhatsApp SDK, Redis, queue, or workflow engine for confirmed single-message v1 sends.

Not added: Firecrawl, `mammoth`, a second LLM SDK, or a new validation library.

Do not add Next.js, Mongoose, ScaleKit, or the old SaaS dashboard dependencies to loan-app.

---

## 12. Open Decisions

Production blockers requiring business/compliance approval:

- exact retention periods for anonymous public chats and CRM transcripts; do not retain either indefinitely
- selected Gemini account/model document retention, training, and regional-processing terms
- final purpose-specific consent/privacy-notice wording and versions
- formal determination of loan-app's DSA/LSP/DLA and Data Fiduciary/Processor roles for each lender relationship
- Meta App Review/Advanced Access, per-user number eligibility/coexistence, template approval, and production messaging costs
- final maker-checker permission matrix for admin, super-admin, compliance, and content approver roles

Resolved:

- provider: Gemini first; one provider and no router in v1
- retrieval: flat curated PostgreSQL knowledge table first; no chunks/vector DB in v1
- lender authority: loan-app `banks` tables own overlapping fields; donor data only fills mapped gaps
- admin console: full governed control over approved runtime config, personas, knowledge, WhatsApp, metrics, transcripts, and emergency stops
- WhatsApp: each CRM user connects their own verified business sender; explicit preview/edit/confirmation; outbound reminders and delivery states only; no client replies, automatic sends, or central sender
- PDF/document summarization: in v1 for authorized CRM documents, gated by provider-policy approval

---

## 13. Out Of Scope For V1

- Token streaming.
- Multi-provider routing.
- Separate chatbot microservice.
- Vector/chunk retrieval unless flat PostgreSQL knowledge search proves insufficient.
- Public file uploads (PDF summarization is CRM-only).
- DOCX summarization.
- Web-search fallback for knowledge answers (Firecrawl path from `agent` - dropped; curated data only).
- Separate `AssistantToolEvent` storage; existing `AuditLog` and message metadata cover v1.
- Two-way WhatsApp inbox, storage of client replies, personal-conversation access, central sender number, bulk/marketing campaigns, automatic reminders, and arbitrary free-form outbound messages.
- Runtime editing or viewing of CORS, network/deployment settings, database URLs, auth/provider secrets, per-user Meta tokens, or immutable audit/consent history.
