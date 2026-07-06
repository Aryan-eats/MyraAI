# Project Documentation — Myra AI Platform

**Last updated:** 2026-06-12  
**Stack:** Next.js 16 (App Router) · TypeScript · MongoDB · Redis · Gemini / OpenAI / Claude

---

## 1. What This Project Is

Myra is a **multi-tenant AI platform** with two distinct product surfaces that share one codebase:

| Surface | Who uses it | Entry point |
|---|---|---|
| **Bot Platform** | Any SaaS customer who wants to embed a customer-support chatbot on their website | `/dashboard`, `POST /api/chat`, `public/widget.js` |
| **GPS India Lending Assistants** | Loan partners (CRM copilot) and public website visitors (lending advisor) | `POST /api/chat/crm`, `POST /api/chat/web` |

The bot platform is the general product. The GPS India lending agents are a specific deployment of that product plus a custom CRM layer.

---

## 2. High-Level Architecture

```
Browser / Embed Widget
        │
        ▼
Next.js App Router (src/app/)
  ├─ API Routes (/api/)
  │     ├─ /chat             ← bot platform RAG chat
  │     ├─ /chat/web         ← GPS web agent
  │     ├─ /chat/crm         ← GPS CRM agent (JWT required)
  │     ├─ /crm-assistant    ← structured CRM assistant service
  │     ├─ /bots             ← bot CRUD
  │     ├─ /knowledge        ← ingestion pipeline
  │     ├─ /auth             ← Scalekit OAuth
  │     └─ /webhooks         ← cron triggers
  │
  ├─ Pages (/dashboard, /embed, /onboarding, ...)
  │
  └─ Middleware (src/proxy.ts) ← protects /dashboard/*
        │
        ├─ MongoDB ─────── Bots, ChatSessions, KnowledgeChunks, KnowledgeSources,
        │                  LendingProducts, Escalations, Settings, PartnerBriefings
        │
        ├─ Redis ──────── Conversation history, response cache, rate limits,
        │                  pipeline snapshots, commission snapshots
        │
        ├─ Gemini API ─── Text generation, tool calling, 768D embeddings
        ├─ OpenAI / Claude (fallback via OpenRouter)
        ├─ GPS India API ── CRM / lending backend (external)
        ├─ Meta WhatsApp API ── Partner messaging
        └─ Scalekit ──────── Enterprise SSO
```

---

## 3. Repository Structure

```
agent/
├─ src/
│   ├─ agents/
│   │   ├─ web/              Web lending advisor agent
│   │   └─ crm/              CRM partner operations agent
│   ├─ server/crm-assistant/ Structured CRM assistant (planner + tools + memory)
│   ├─ app/
│   │   ├─ api/              All API routes
│   │   ├─ dashboard/        Authenticated dashboard pages
│   │   ├─ embed/            Iframe chat page
│   │   ├─ chat/             Full-page chat (dev/testing)
│   │   ├─ onboarding/       First-run wizard
│   │   └─ login/            Auth gate
│   ├─ components/           React client components
│   ├─ lib/                  Services, utilities, external adapters
│   ├─ model/                Mongoose schemas
│   ├─ jobs/                 Cron workers
│   ├─ tests/                Vitest unit tests
│   └─ types/                Shared TypeScript types
├─ public/
│   ├─ widget.js             Embeddable chat widget (production)
│   └─ chatBot.js            Legacy widget (deprecated)
├─ db/                       PostgreSQL schema (CRM assistant demo data)
├─ docs/                     Project documentation
├─ docker-compose.yml        Local dev services
└─ .env.example              Required environment variables
```

---

## 4. Database Models

All MongoDB access is through Mongoose. Every model with tenant data is indexed on its `botId` or `ownerId` field.

### 4.1 Bot
**File:** `src/model/Bot.ts` · **Collection:** `bots`

The top-level tenant entity. One bot = one embedded chatbot instance.

| Field | Type | Notes |
|---|---|---|
| `ownerId` | string | User ID from Scalekit (indexed) |
| `name` | string | Display name |
| `slug` | string | URL-safe unique identifier |
| `systemPrompt` | string | Custom persona/instructions for this bot |
| `primaryColor` | string | Hex, used by widget |
| `welcomeMessage` | string | First message shown in widget |
| `fallbackMessage` | string | Shown when answer not in knowledge base |
| `allowedDomains` | string[] | CORS whitelist for widget embedding |
| `status` | `active` \| `inactive` | Inactive bots reject chat |

### 4.2 KnowledgeSource
**File:** `src/model/KnowledgeSource.ts` · **Collection:** `knowledgesources`

Represents one uploaded document, pasted text block, or crawled URL.

| Field | Type | Notes |
|---|---|---|
| `botId` | string | Tenant scoping (indexed) |
| `type` | `text` \| `file` \| `url` | Input method |
| `name` | string | Display name (filename or hostname) |
| `originalContent` | string | Raw extracted text (excluded from list queries) |
| `status` | `pending` \| `processing` \| `ready` \| `failed` | Ingestion state |
| `chunkCount` | number | How many chunks were generated |
| `errorMessage` | string? | Set on failure |

### 4.3 KnowledgeChunk
**File:** `src/model/KnowledgeChunk.ts` · **Collection:** `knowledgechunks`

One 500-char slice of a KnowledgeSource with its embedding vector. This is what the RAG system searches.

| Field | Type | Notes |
|---|---|---|
| `botId` | string | Indexed for scoped retrieval |
| `sourceId` | string | References KnowledgeSource |
| `content` | string | The text slice |
| `embedding` | number[] | 768-dimension Gemini vector |
| `metadata.sourceType` | string | Inherited from source |
| `metadata.sourceName` | string | For attribution |
| `metadata.chunkIndex` | number | Position within source |

> **Atlas note:** In production, create a vector search index named `embedding_index` (768 dims, cosine, filtered by `botId`) on this collection. The dev fallback uses in-memory cosine similarity.

### 4.4 ChatSession
**File:** `src/model/ChatSession.ts` · **Collection:** `chatsessions`

Stores the full message history for each visitor session.

| Field | Type | Notes |
|---|---|---|
| `botId` | string | Indexed |
| `sessionId` | string | UUID, unique, generated per visitor window |
| `visitorId` | string | IP or fingerprint |
| `messages` | `{ role, content, timestamp }[]` | Roles: `user` \| `assistant` |

### 4.5 Lending-Specific Models

| Model | Collection | Purpose |
|---|---|---|
| `knowledge.model.ts` (`LendingProductModel`) | `lending_products` | Loan products (lender, rates, tenure, documents). Text-indexed for full-text search. |
| `escalation.model.ts` | `escalations` | Log of conversations escalated to human ops |
| `settings.model.ts` | `settings` | Per-owner business settings (name, email, knowledge blob) |
| `PartnerBriefingModel` (in `briefingGenerator.ts`) | `partner_briefings` | Daily AI-generated briefings, 24h TTL via `expireAfterSeconds` index |

---

## 5. Library Layer (`src/lib/`)

### 5.1 Database Connection — `db.ts`
`connectDb()` opens a Mongoose connection with global caching so serverless functions reuse the same connection across warm invocations. Reads `MONGODB_URI` or `MONGODB_URL`.

### 5.2 Authentication

**`getSession.ts`** — `getSession()`: Reads the Scalekit session cookie and returns the authenticated user object. Used by dashboard pages and bot management routes.

**`chatAuth.ts`** — Chat-specific auth with three exports:
- `getChatUser(req)`: Extracts a JWT from `Authorization: Bearer` or the `gpsToken` query param, optionally validates RS256 signature (if `GPS_JWT_PUBLIC_KEY` is set), then calls `GET /internal/me` on the GPS API to resolve the full user record. Returns `ANONYMOUS_USER` if missing/invalid.
- `requirePartnerAuth(req)`: Wraps `getChatUser` and asserts the user is a partner. Used exclusively by the CRM chat route.
- `requireSessionId(req)`: Returns the `x-session-id` header value or generates a fresh UUID.

**`ScaleKit.ts`** — Initialises the Scalekit Node SDK for SSO redirect and callback handling.

### 5.3 API Security — `apiSecurity.ts`

- **`MemoryRateLimiter`**: Sliding-window counter stored in process memory. Falls back to Redis `INCR` + `EXPIRE` when Redis is available.
- **`parseAllowedOrigins()` / `resolveAllowedOrigin()` / `applyCorsHeaders()`**: CORS enforcement based on the `CHAT_ALLOWED_ORIGINS` env list.
- **`buildRateLimitKey(req, userId)`**: Produces `user:<id>` or `ip:<address>` keys.
- **`createChatRateLimiter()`**: Reads `CHAT_RATE_LIMIT_MAX` and `CHAT_RATE_LIMIT_WINDOW_MS` from env, returns a configured limiter instance.

### 5.4 Embedding and Retrieval

**`chunker.ts`** — `chunkText(text, chunkSize=500, overlap=50)`:
- Normalises whitespace.
- Slides a window across the text with 50-character overlap between adjacent chunks.
- Discards chunks under 20 characters.

**`embeddings.ts`**:
- `embedText(text)`: Calls Gemini `text-embedding-004` → 768-dimension `number[]`.
- `embedChunks(chunks[])`: Batches calls 5 at a time with a 200 ms inter-batch pause to stay within Gemini free-tier rate limits.

**`retrieval.ts`** — `retrieveRelevantChunks(botId, query, topK=5)`:
1. Embeds the query.
2. Fetches all KnowledgeChunks for the bot (or uses Atlas `$vectorSearch` if `VECTOR_SEARCH_ENABLED=true`).
3. Ranks by cosine similarity and returns the top-K `content` strings.

### 5.5 Ingestion Pipeline — `ingest.ts`

`ingestSource(sourceId)` is the async pipeline invoked after a KnowledgeSource is created:

```
KnowledgeSource (pending)
  → status = "processing"
  → chunkText(originalContent)
  → embedChunks(chunks)         [Gemini API]
  → KnowledgeChunk.deleteMany({ sourceId })   [re-ingest safe]
  → KnowledgeChunk.insertMany(chunkDocs)
  → status = "ready", chunkCount = N
  [on error] → status = "failed", errorMessage = message
```

The route fires this without `await` (202 Accepted pattern) so the HTTP response returns immediately.

### 5.6 File Parsing — `parsers.ts`

`parseFile(buffer, filename)` dispatches on extension:
- `.txt` / `.md` / `.csv` → `buffer.toString('utf-8')`
- `.pdf` → `pdf-parse`
- `.docx` → `mammoth.extractRawText`

`parseUrl(url)` fetches the page, loads it into `cheerio`, removes `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, and returns the body text.

### 5.7 Cache Layer — `chatCache.ts`

All cache operations go through `ioredis`. If Redis is unavailable, they fall back silently to in-process stubs so dev works without Redis.

| Function | TTL | Key pattern |
|---|---|---|
| `getCachedResponse / setCachedResponse` | Intent-dependent | `chat:cache:<userId>:<intentSlug>` |
| `saveConversationInCache / getConversationFromCache` | 7200 s | `conv:<sessionId>` |
| `cachePipeline / getCachedPipeline` | 300 s | `pipeline:<partnerId>` |
| `cacheCommissions / getCachedCommissions` | 1800 s | `commissions:<partnerId>` |
| `incrementRateLimitCounter` | Sliding window | `ratelimit:<key>` |

### 5.8 LLM Routing — `llm/router.ts`

Multi-provider orchestration with automatic fallback:

1. **Provider order** is read from `LLM_PROVIDER_ORDER` (default: `gemini,openai,claude`).
2. Each provider is attempted in order. If the API key is missing or the call fails, the next provider is tried.
3. OpenAI and Claude are proxied through **OpenRouter** when `OPENROUTER_API_KEY` is set.
4. **Ensemble mode** (set `LLM_ORCHESTRATION_MODE=ensemble`): Multiple providers generate in parallel, and a synthesis provider merges the outputs. Higher cost, higher instruction fidelity.

### 5.9 Gemini Adapter — `gemini.ts`

- `generateText({ systemInstruction, message, temperature, jsonMode })`: Single-turn text generation. Routes through the LLM router.
- `generateWithTools({ systemInstruction, messages, tools, temperature })`: Multi-turn tool-calling loop used by both agents. Executes tool calls returned by the model and feeds results back until the model stops requesting tools.
- Conversation history is stored in Redis via `chatCache.ts` (max 20 turns, 7200 s TTL).

### 5.10 GPS India Bridge — `gpsBridge.ts`

Wraps all calls to the external GPS India backend. Every function calls `gpsRequest<T>(path, options)` which adds the `Authorization: Bearer` header and translates HTTP errors into typed `GpsBridgeError` exceptions.

Key functions grouped by domain:

**Partner context** (used by CRM agent on every turn):
- `fetchPartnerPipelineSnapshot(token)` → active leads, stalled count, status breakdown
- `fetchPartnerTodaysActions(token)` → leads needing follow-up/documents, due dates
- `fetchPartnerCommissionSnapshot(token)` → pending/processing/credited amounts
- `fetchPartnerRiskFlags(token)` → high-severity risk leads

**Lead operations**:
- `fetchPartnerLeadProfile(leadId, token)` → age, CIBIL, income, obligations, NPA/duplicate flags
- `getClientWhatsappConsent(clientId, token)` → bool
- `appendLeadPartnerNote(leadId, note, visibility, token)`
- `logWhatsappEvent / logDocumentAnalysis` → audit logging

**Financial queries** (intent-routed, cached):
- `getCommissionStatus / getLoanStatus / getDocumentChecklist / getEmiSchedule / getLeadPipeline`

**Batch jobs**:
- `fetchPartnerContacts(token)` → list of all active partners (used by briefing cron)
- `savePartnerBriefing(partnerId, briefing, token)` → persists generated briefing

### 5.11 Soft Check Engine — `softCheckEngine.ts`

`runSoftCheck(leadId, partnerId, auth)` runs a 5-layer eligibility assessment:

1. **Hard disqualifiers** (any one fails the lead): CIBIL < 600, age outside 21–65, unemployed/student, NPA flag, duplicate within 90 days.
2. **FOIR calculation**: `projectedFOIR = (monthlyObligations + proposedEmi) / monthlyIncome`. Risk grades: low ≤ 55%, high ≤ 70%, very_high > 70%.
3. **LTV check** (home loan / LAP only): Home loan max 75%, LAP max 60%.
4. **Lender matching**: Searches `lending_products` by product type, scores each lender on CIBIL band, income threshold, and loan amount.
5. **Viability verdict**: Viable if no hard disqualifier AND projected FOIR ≤ 0.70 AND LTV within limits.

Returns `SoftCheckResult` with full breakdown, `suggestedAction`, `confidence`, and `lenderMatches[]`.

### 5.12 Document Analyser — `documentAnalyser.ts`

`analyseDocument(fileBuffer, mimeType, documentType, lenderChecklist)`:
- Sends document image/PDF to Gemini vision.
- Extracts structured fields (identity, financial, dates, signatures, stamps).
- **Redacts** sensitive data — shows only last 4 digits of Aadhaar/PAN.
- Validates each checklist item: `present` / `missing` / `illegible` / `expired` / `mismatch`.
- Returns `DocumentAnalysisResult` with `checklistStatus[]`, `overallStatus`, `issues[]`, and a `partnerNote` for CRM logging.

### 5.13 WhatsApp — `whatsapp.ts`

`sendWhatsappMessage(msg, auth)`:
1. Enforces 50 messages/hour rate limit per partner (Redis counter).
2. Checks opt-in via `getClientWhatsappConsent` on the GPS API.
3. If `ENABLE_WHATSAPP=true` and consent granted: POSTs to Meta WhatsApp Cloud API.
4. If flag is false: Returns `{ status: "stubbed" }` (safe for dev).
5. Logs the send event to GPS bridge regardless.

`sendBulkWhatsapp(messages[], auth)`: Parallel-sends via `Promise.allSettled`.

### 5.14 Briefing Generator — `briefingGenerator.ts`

`generateMorningBriefing(partnerId)`:
1. Fetches pipeline snapshot, today's actions, commissions, risk flags **in parallel**.
2. Calls Gemini to compose:
   - `whatsappSummary` (≤4 lines, sent as WhatsApp template)
   - `inAppSections[]`: snapshot / priority actions / commission / risk
3. Saves to `partner_briefings` collection with a 24-hour TTL index.
4. Optionally sends WhatsApp template message (flag-controlled).

`getTodayBriefing(partnerId)`: Returns cached briefing if it exists within the 24h window.

### 5.15 Knowledge Base — `knowledgeBase.ts`

For the GPS lending use case (separate from the multi-tenant RAG system):

- `searchLendingKnowledge(query, filters?)`: Full-text search on `lending_products` (MongoDB text index). Falls back to filter-only query if no text hits. Returns `KnowledgeSearchResult[]` with confidence scores.
- `getLenderChecklist(lenderName, productType)`: Returns the required document list for a specific lender × product type combination.
- `upsertLendingProducts(products[])`: Bulk upsert by lender + product type key.

---

## 6. Agents (`src/agents/`)

Agents are agentic loops that call `generateWithTools` and execute tool calls until the model stops requesting them.

### 6.1 Web Agent — `src/agents/web/`

**Persona** (`persona.ts`): Myra, a public lending advisor on the GPS India website. Conservative constraints — never promises approval, never asks for Aadhaar/OTP/account numbers, captures leads only when intent is unambiguous.

**Tools** (4):

| Tool | What it does |
|---|---|
| `searchKnowledge` | Full-text + filter search on `lending_products` |
| `checkEligibility` | FOIR-based rough eligibility (income, obligations, proposed EMI) |
| `compareProducts` | Compares lenders for a given product type and loan amount |
| `captureLead` | Stores name + phone + intent summary to MongoDB |

**Loop** (`agent.ts`): `runWebAgent(message, history)` → calls `generateWithTools` → executes each tool → feeds result back → returns `AgentResponse { text, toolsUsed[], leadCaptured? }`.

### 6.2 CRM Agent — `src/agents/crm/`

**Persona** (`persona.ts`): `getCrmSystemPrompt(partner)` — Myra, operations copilot for a named GPS India partner. Direct and action-oriented, max 8 tool iterations per turn, can respond in Hindi, never estimates financial data.

**Tools** (7):

| Tool | What it does |
|---|---|
| `queryPipeline` | `fetchPartnerPipelineSnapshot` + `fetchPartnerTodaysActions` (5 min cache) |
| `getCommissions` | `fetchPartnerCommissionSnapshot` (30 min cache) |
| `sendWhatsapp` | Single or bulk WhatsApp template send |
| `analyseDocument` | Gemini vision document analysis with checklist |
| `runSoftCheck` | Full 5-layer eligibility assessment |
| `generateBriefing` | Generate morning briefing on demand |
| `addPartnerNote` | Append lead note with visibility scope |

**Loop** (`agent.ts`): `runCrmAgent(message, history, auth)` → same structure as web agent but with partner context injected into system prompt.

---

## 7. CRM Assistant Service (`src/server/crm-assistant/`)

A second, more structured CRM interface (separate from the free-form CRM agent). Used by `POST /api/crm-assistant`.

### Architecture

```
Request
  → CrmAssistantService.handle()
      → ContextBuilder.build()        Load session + portfolio snapshot + recalled memories
      → AssistantPlanner.plan()       Pattern-match intent, choose tool + args
      → AssistantToolRegistry.execute()  Run tool, return structured result
      → composeAssistantAnswer()      Format result as human-readable answer
      → SessionMemoryStore.set()      Persist updated session
  → AssistantResponse { answer, intent, reasoning[], data?, actions? }
```

### Intents (10)
`cases.pending`, `pipeline.docs_pending`, `partner.approval_insights`, `client.intelligence`, `client.details`, `case.update`, `client.create`, `general.greeting`, `general.identity`, `general.help`

### Tools (7)
`get_pending_cases`, `get_pending_documents`, `get_partner_stats`, `get_client_details`, `get_client_recommendation`, `update_case_status`, `create_client`

### Memory
- **Session memory** (`SessionMemoryStore`): Redis-backed, 24h TTL. Tracks last client ID, last application ID, recent conversation turns.
- **Semantic memory** (`SemanticMemoryStore`): In-process (last 50 records per partner). Token-based fuzzy matching to recall relevant past context for a query.

### Data Layer
`DemoCrmRepository` in `repository.ts` provides an in-memory demo dataset that can be swapped for a real database. Actor-scoped: partners see only their own data.

---

## 8. API Routes

### Authentication

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/login` | GET | None | Redirects to Scalekit authorization URL |
| `/api/auth/callback` | GET | None | Handles Scalekit OAuth callback, sets session cookie |
| `/api/auth/logout` | GET | Session | Clears session cookie |

### Chat

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/chat` | POST | None (rate limited) | Bot platform RAG chat. Input: `{ botId, message, sessionId? }`. Looks up bot, retrieves relevant knowledge chunks, calls Gemini, saves to ChatSession. Returns `{ reply, sessionId }`. |
| `/api/chat/web` | POST | None | GPS web agent. Input: `{ message, sessionId?, endSession? }`. Runs `runWebAgent`. Returns `{ sessionId, answer, toolsUsed, leadCaptured }`. |
| `/api/chat/crm` | POST | Partner JWT | GPS CRM agent. Input: `{ message, sessionId?, endSession? }`. Validates partner JWT, runs `runCrmAgent`. Returns `{ sessionId, answer, toolsUsed, iterations }`. |
| `/api/crm-assistant` | POST | Session or demo actor | Structured CRM assistant. Runs `CrmAssistantService.handle`. Returns `AssistantResponse`. |

### Bot Management

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/bots` | GET | Session | List all bots for authenticated owner |
| `/api/bots` | POST | Session | Create bot. Body: `{ name, systemPrompt?, primaryColor?, welcomeMessage?, fallbackMessage?, allowedDomains?, status? }`. Auto-generates unique slug. |
| `/api/bots/[botId]` | GET | Session | Get single bot (owner-scoped) |
| `/api/bots/[botId]` | PUT | Session | Update bot settings |
| `/api/bots/[botId]` | DELETE | Session | Delete bot |
| `/api/bots/[botId]/public` | GET | None | Public-safe info for widget: `{ name, welcomeMessage, primaryColor }` |
| `/api/bots/[botId]/analytics` | GET | Session | `{ totalSessions, totalMessages, last7Days[] }` via MongoDB aggregation |

### Knowledge

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/knowledge/upload` | POST | None* | Multipart: `{ botId, file }`. Parses file, creates KnowledgeSource, fires async ingestion. Returns 202. |
| `/api/knowledge/text` | POST | None* | JSON: `{ botId, type: 'text'\|'url', content, name? }`. Same pipeline. |
| `/api/knowledge/[botId]` | GET | None* | List sources for bot (excludes `originalContent`) |
| `/api/knowledge/[botId]` | DELETE | None* | `{ sourceId }` — deletes source and all its chunks |

> \* **Security gap documented in `todo.md` Phase A**: These routes currently do not verify session or bot ownership.

### Settings & Other

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/settings` | GET/POST | Session | Read/write owner settings (businessName, supportEmail, knowledge) |
| `/api/settings/get` | GET | Session | Alias for settings GET |
| `/api/partner/briefing/today` | GET | Partner JWT | Returns or generates today's morning briefing |
| `/api/webhooks/briefing-cron` | POST | Secret header | Validates `x-briefing-secret`, generates briefings for all active partners in parallel |

---

## 9. Pages and UI

### Public / Unauthenticated
| Page | Route | Description |
|---|---|---|
| Home | `/` | Server component. If user has no bot, redirects to `/onboarding`. Otherwise renders `HomeClient`. |
| Login | `/login` | "Sign in with Scalekit" button → `/api/auth/login`. |
| Embed | `/embed` | Full-page iframe target. Renders `EmbedChat` inside a Suspense boundary. |
| Chat | `/chat` | Dev/test page. Accepts `?mode=web\|crm` and `?ownerId`. Renders `ChatClient`. |

### Authenticated Dashboard
| Page | Route | Description |
|---|---|---|
| Dashboard | `/dashboard` | Main hub. Redirects to login if no session. Renders `DashboardClient`. |
| Bots List | `/dashboard/bots` | Renders `BotsManager` — bot list, create form. |
| Bot Settings | `/dashboard/bots/[botId]` | Server: fetches bot, verifies owner. Renders `BotSettingsClient` with edit form + embed code copy panel. |
| Knowledge | `/dashboard/bots/[botId]/knowledge` | Renders `BotKnowledgeClient` — file upload, text input, URL input, source list with status polling. |
| Onboarding | `/onboarding` | First-run wizard: name bot → add knowledge → get embed code. |

### Key Client Components

**`ChatClient`**: Message thread + input form. Calls `/api/chat/web` or `/api/chat/crm` depending on `mode` prop.

**`EmbedChat`**: Minimal chat UI inside the iframe. Reads `botId` from `useSearchParams`, fetches public bot config from `/api/bots/[botId]/public`, stores `sessionId` in `sessionStorage`. Has a close button that posts `{ type: 'myra:close' }` to `window.parent`.

**`BotKnowledgeClient`**: Three upload methods (file, text, URL) each POST to the relevant knowledge route. Polls `/api/knowledge/[botId]` every 3 seconds while any source status is `processing`. Shows status badges (pending/processing/ready/failed) and chunk counts.

**`BotSettingsClient`**: Edit form with PUT to `/api/bots/[botId]`. Includes embed code panel:
```html
<script src="<NEXT_PUBLIC_APP_URL>/widget.js" data-bot-id="<id>"></script>
```

---

## 10. Embeddable Widget (`public/widget.js`)

Vanilla JS, no dependencies, injected via a single `<script>` tag:

```html
<script src="https://your-domain.com/widget.js" data-bot-id="YOUR_BOT_ID"></script>
```

**What it does:**
1. Reads `data-bot-id` from the script tag.
2. Injects a fixed-position `<iframe>` pointing to `/embed?botId=<id>` (hidden initially).
3. Injects a floating chat bubble button (indigo, bottom-right).
4. Toggles iframe visibility on button click, swapping the icon.
5. Listens for `postMessage` from the iframe:
   - `{ type: 'myra:close' }` — hides the widget.
   - `{ type: 'myra:color', color: '#hex' }` — updates button background to match bot's `primaryColor`.

---

## 11. Jobs (`src/jobs/`)

### Morning Briefing — `morningBriefing.ts`
- Cron schedule: `0 7 * * *` (7:00 AM IST, `Asia/Kolkata`)
- Enabled by `ENABLE_MORNING_BRIEF=true`
- Optional: `RUN_BRIEF_ON_START=true` runs one cycle immediately on startup
- Process: Fetch all active partners → `Promise.allSettled(partners.map(generateMorningBriefing))` → log results

### Knowledge Seed — `seedKnowledge.ts`
- One-time script: `npx tsx src/jobs/seedKnowledge.ts`
- Seeds 27 lending products across GPS India's lender network (HDFC, SBI, ICICI, Axis, Kotak, Bajaj, Tata)
- Each product includes: interest rate range, tenure, required documents, CIBIL thresholds, special features
- Uses `upsertLendingProducts` (idempotent, safe to run multiple times)

---

## 12. Data Flows

### Flow 1: Bot Platform Chat (RAG)

```
1. Visitor sends message via widget.js
2. iframe (EmbedChat) POSTs to /api/chat { botId, message, sessionId }
3. Chat route:
   a. Validates Zod schema
   b. Checks CORS origin (CHAT_ALLOWED_ORIGINS)
   c. Checks rate limit (per IP/user)
   d. Loads Bot document (verifies active)
   e. Calls retrieveRelevantChunks(botId, message, 5)
      → embedText(message) via Gemini
      → cosine similarity against KnowledgeChunks
      → returns top-5 content strings
   f. Builds system prompt: bot.systemPrompt + knowledge context
   g. Loads ChatSession (create if new)
   h. Calls generateText with last-10-message history
   i. Appends both messages to ChatSession
4. Returns { reply, sessionId }
```

### Flow 2: Knowledge Ingestion

```
1. Owner uploads file via BotKnowledgeClient
2. POST /api/knowledge/upload { botId, file }
3. Route:
   a. parseFile(buffer, filename) → { text, name }
   b. KnowledgeSource.create({ botId, type, name, originalContent, status: 'pending' })
   c. ingestSource(sourceId) — fired without await
   d. Returns 202 { sourceId, status: 'processing' }
4. ingestSource async:
   a. KnowledgeSource.update(status: 'processing')
   b. chunkText(originalContent) → string[] (500-char windows, 50-char overlap)
   c. embedChunks(chunks) → number[][] (Gemini, batched 5 at a time, 200ms between)
   d. KnowledgeChunk.deleteMany({ sourceId }) (idempotent re-ingest)
   e. KnowledgeChunk.insertMany(chunkDocs)
   f. KnowledgeSource.update(status: 'ready', chunkCount: N)
5. Dashboard polls GET /api/knowledge/[botId] every 3s until all sources are ready
```

### Flow 3: GPS Web Chat

```
1. Visitor sends message on GPS India website
2. POST /api/chat/web { message, sessionId? }
3. Route loads conversation history from Redis
4. runWebAgent(message, history):
   a. getWebSystemPrompt() as system instruction
   b. generateWithTools(tools=[search_knowledge, check_eligibility, compare_products, capture_lead])
   c. Model may call tools in any order; each tool result is fed back
   d. Loop terminates when model returns text-only response
5. Saves updated history to Redis
6. Returns { sessionId, answer, toolsUsed[], leadCaptured? }
```

### Flow 4: GPS CRM Chat

```
1. Partner sends message (authenticated app)
2. POST /api/chat/crm { message, sessionId? }  [Authorization: Bearer <partner-jwt>]
3. requirePartnerAuth(req) → AuthenticatedPartner { userId, partnerId, partnerName, partnerTier }
4. runCrmAgent(message, history, auth):
   a. getCrmSystemPrompt(partner) injected with partner name/tier
   b. generateWithTools(7 tools — pipeline, commissions, WhatsApp, documents, soft-check, briefing, notes)
   c. Each tool call may hit GPS API, Redis, Gemini vision, Meta WhatsApp
   d. Max 8 iterations enforced
5. Returns { sessionId, answer, toolsUsed[], iterations }
```

### Flow 5: Morning Briefing

```
1. External cron (EasyCron or similar) hits POST /api/webhooks/briefing-cron
   with header: x-briefing-secret: <BRIEFING_SECRET>
2. Route validates secret, checks ENABLE_MORNING_BRIEF=true
3. fetchPartnerContacts() → active partner list
4. For each partner (parallel Promise.allSettled):
   a. fetchPartnerPipelineSnapshot (GPS API)
   b. fetchPartnerTodaysActions (GPS API)
   c. fetchPartnerCommissionSnapshot (GPS API)
   d. fetchPartnerRiskFlags (GPS API)
   e. Gemini composes whatsappSummary + inAppSections
   f. PartnerBriefingModel.create({ ...briefing, expiresAt: now+24h })
   g. savePartnerBriefing (GPS API)
   h. sendWhatsappMessage (if ENABLE_WHATSAPP=true)
5. Returns { scheduledAt, total, success, failed }
```

---

## 13. External Service Integrations

| Service | Role | Auth method | Key env vars |
|---|---|---|---|
| **Gemini API** | Primary LLM, embeddings (`text-embedding-004`), vision (document analysis) | API key | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| **OpenAI** | LLM fallback | API key via OpenRouter | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENROUTER_API_KEY` |
| **Claude (Anthropic)** | LLM fallback | API key via OpenRouter | `CLAUDE_API_KEY`, `CLAUDE_MODEL` |
| **OpenRouter** | Proxy for OpenAI/Claude fallback | API key | `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` |
| **Scalekit** | Enterprise SSO for dashboard users | OAuth 2.0 | `SCALEKIT_ENVIRONMENT_URL`, `CLIENT_ID`, `CLIENT_SECRET` |
| **GPS India API** | CRM/lending backend (lead data, commissions, WhatsApp events, briefings) | JWT Bearer | `GPS_INDIA_API_URL`, `GPS_INDIA_WEBHOOK_URL`, `GPS_SERVICE_TOKEN`, `GPS_JWT_*` |
| **Meta WhatsApp Cloud API** | Partner messaging | Bearer token | `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` |
| **MongoDB** | Primary persistence | Connection string | `MONGODB_URI` |
| **Redis** | Cache, conversation history, rate limiting | Connection URL | `REDIS_URL` |

---

## 14. Feature Flags

| Env var | Effect when `true` |
|---|---|
| `ENABLE_WHATSAPP` | Actually sends WhatsApp messages (otherwise stubs) |
| `ENABLE_SOFT_CHECK` | Activates the soft-check tool in the CRM agent |
| `ENABLE_MORNING_BRIEF` | Enables morning briefing cron job |
| `RUN_BRIEF_ON_START` | Runs one briefing cycle immediately on app startup |
| `VECTOR_SEARCH_ENABLED` | Switches retrieval from in-memory cosine to MongoDB Atlas `$vectorSearch` |
| `LLM_ORCHESTRATION_MODE=ensemble` | Enables multi-provider ensemble synthesis (higher cost) |

---

## 15. Security Model

### Authentication layers
- **Dashboard/bot management**: Scalekit session cookie → `getSession()` → `ownerId` scopes all queries.
- **CRM chat**: Partner JWT in `Authorization: Bearer` header → `requirePartnerAuth()` → `AuthenticatedPartner` object passed to every GPS API call and tool.
- **Embed widget / public chat**: No auth. Rate-limited by IP. CORS origin validated against `CHAT_ALLOWED_ORIGINS`.

### CORS
The `resolveAllowedOrigin()` function validates the request `Origin` against a whitelist parsed from `CHAT_ALLOWED_ORIGINS`. Returns 403 if no match. Each bot's `allowedDomains` field is intended to extend this per bot (Phase A work).

### Rate limiting
Sliding-window counters in Redis (or in-memory fallback). Chat: 30 req/60s by default. WhatsApp: 50 sends/hour per partner.

### Data isolation
Every MongoDB query on knowledge, chat, and settings data is filtered by `botId` or `ownerId`. Partner JWT is validated before any GPS API call, and the partner scope is enforced in `gpsBridge.ts`, not just at the prompt layer.

### Sensitive data handling
- Document analysis returns only redacted structured fields (last-4 Aadhaar/PAN). Raw document bytes are not persisted.
- WhatsApp consent is checked before every send.
- `.env` is in `.gitignore`. `.env.example` uses placeholder values only.

### Known gap
Knowledge management API routes (`/api/knowledge/*`) currently lack authentication. Any caller who knows a `botId` can upload or delete knowledge. Fix is documented in `docs/todo.md` Phase A.

---

## 16. Testing

**Framework:** Vitest (`npm test`)  
**Config:** `vitest.config.mjs` — alias `@` → `src/`, node environment, test files in `src/tests/`.

22 test files, 45 tests. All pass as of 2026-06-12.

| Test file | Subject |
|---|---|
| `api-security.test.ts` | Rate limiter, CORS origin validation |
| `chat-auth.test.ts` | JWT extraction, partner auth, anonymous fallback |
| `chat-route.test.ts` | Full bot chat flow (RAG, session, Zod validation) |
| `chat-rag.test.ts` | `retrieveRelevantChunks`, cosine similarity math |
| `chunk-text.test.ts` | `chunkText` overlap and min-length filtering |
| `parsers.test.ts` | File parsing (PDF, DOCX, text, URL) |
| `bot-route.test.ts` / `bots-route.test.ts` | Bot CRUD, slug generation, owner scoping |
| `bot-analytics-route.test.ts` | Aggregation pipeline correctness |
| `bot-public-route.test.ts` | Public info endpoint (no sensitive data leaked) |
| `crm-agent.test.ts` | CRM agent tool execution, iteration limit |
| `web-agent.test.ts` | Web agent tool calls, lead capture |
| `soft-check-engine.test.ts` | All 5 eligibility layers |
| `check-eligibility.test.ts` | FOIR calculation edge cases |
| `compare-products.test.ts` | Product comparison scoring |
| `analyse-document.test.ts` | Redaction, checklist validation |
| `send-whatsapp-message.test.ts` | Rate limit enforcement, consent blocking |
| `chat-documents.test.ts` | Session document storage and retrieval |
| `llm-router.test.ts` | Multi-provider fallback order |
| `middleware.test.ts` | Auth middleware redirect logic |
| `onboarding.test.ts` | `needsOnboarding` state detection |

---

## 17. Local Development Setup

**Prerequisites:** Node.js 18+, Docker (for Redis/Postgres)

```bash
# 1. Clone and install
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in: MONGODB_URI, GEMINI_API_KEY, SCALEKIT_* keys
# Optional: GPS_INDIA_*, WHATSAPP_*, OPENAI/CLAUDE keys

# 3. Start local services
docker-compose up -d          # Redis + Postgres

# 4. Seed lending knowledge (one-time)
npx tsx src/jobs/seedKnowledge.ts

# 5. Start dev server
npm run dev                   # http://localhost:3000

# 6. Run tests
npm test

# 7. Production build check
npm run build
```

**Minimum viable dev setup** (bot platform only, no GPS lending features):
- `MONGODB_URI` — local or Atlas
- `GEMINI_API_KEY` — for embeddings and chat
- `SCALEKIT_*` — for dashboard login
- Redis is optional (falls back to in-memory)

---

## 18. Deployment Notes

- **Vercel** is the intended host (Next.js App Router, serverless functions).
- Knowledge upload routes (`/api/knowledge/upload`) set `export const runtime = 'nodejs'` — required because `pdf-parse` and `mammoth` are Node.js-only and cannot run in the Edge runtime.
- Default Next.js body limit is **4 MB**. Increase in `next.config.ts` or use direct-to-storage (S3/Cloudinary) for large files.
- For production retrieval at scale (>10k chunks per bot), enable Atlas `$vectorSearch` via `VECTOR_SEARCH_ENABLED=true` and create the vector index manually in Atlas UI. Requires an **M10+ cluster**.
- Gemini `text-embedding-004` free tier allows ~1,500 embedding calls/day. For high-volume ingestion, move `ingestSource` to a Redis-backed queue (ioredis is already installed).
- Set `NEXT_PUBLIC_APP_URL` to your production domain — the embed code generator and OAuth redirect use it.
