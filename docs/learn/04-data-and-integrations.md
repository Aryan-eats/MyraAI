# Data And Integrations

## MongoDB

Connection:

- `src/lib/db.ts`
- Env: `MONGODB_URI` or `MONGODB_URL`

The connection is cached globally so warm server processes reuse it.

## Mongoose Models

| Model file | Collection | Purpose |
| --- | --- | --- |
| `Bot.ts` | default Mongoose pluralization | Owner-scoped bot config |
| `ChatSession.ts` | default Mongoose pluralization | Embedded widget session history |
| `KnowledgeSource.ts` | default Mongoose pluralization | Raw uploaded/pasted/crawled knowledge |
| `KnowledgeChunk.ts` | default Mongoose pluralization | Embedded chunks for RAG |
| `knowledge.model.ts` | `knowledge_documents` | Audience-scoped legacy FAQ documents |
| `settings.model.ts` | default Mongoose pluralization | Owner business settings and knowledge blob |
| `knowledgeBase.ts` local schema | `lending_products` | GPS lending product fallback data |
| `briefingGenerator.ts` local schema | `partner_briefings` | Stored daily partner briefings with TTL |

## Bot Knowledge Data Flow

```text
KnowledgeSource.originalContent
  -> chunkText()
  -> embedChunks()
  -> KnowledgeChunk.insertMany()
  -> retrieveRelevantChunks()
  -> /api/chat bot answer
```

Chunk defaults:

- Size: 500 characters.
- Overlap: 50 characters.
- Chunks shorter than 20 characters are dropped.
- Embeddings: Gemini `text-embedding-004`, 768 dimensions.

Retrieval currently fetches bot chunks and ranks by in-process cosine
similarity. There is no live Atlas vector-search branch in the current
`retrieval.ts`.

## Redis

Connection helpers:

- `src/lib/gemini.ts`
- `src/lib/chatCache.ts`

Default URL:

```env
REDIS_URL=redis://127.0.0.1:6379
```

Common keys:

| Key | Purpose | TTL |
| --- | --- | --- |
| `conv:<sessionId>` | First-party agent chat history | 2 hours |
| `chat:cache:<userId>:<intentSlug>` | Legacy `/api/chat` cached answers | Intent-specific |
| `crm:pipeline:<partnerId>` | CRM pipeline cache | 5 minutes |
| `crm:commissions:<partnerId>` | CRM commission cache | 30 minutes |
| `rate:wa:<partnerId>:hour` | WhatsApp hourly counter | 1 hour |

Most Redis failures are swallowed so local development can continue, but that
also means cache/history bugs can hide unless you test with Redis running.

## PostgreSQL

Connection:

- `src/lib/pgClient.ts`
- Env: `DATABASE_URL`

Important: current code reads `DATABASE_URL`. The checked-in
`docker-compose.yml` sets `POSTGRES_URL`, which will not activate these helpers.

Current query helpers expect the real GPS India schema, including tables such
as:

- `banks`
- `lender_doc_requirements`
- `leads`
- `lead_documents`
- `lead_timeline`
- `partners`
- `partner_users`
- `users`
- `consent_grants`

Do not treat `db/crm_assistant_schema.sql` as the source of truth for these
helpers. That SQL file defines an older/demo shape with tables such as
`loan_applications` and `clients`, which current `loanDb.ts`, `crmDb.ts`, and
`adminDb.ts` do not query.

## PostgreSQL Helper Boundaries

| File | Scope | Notes |
| --- | --- | --- |
| `loanDb.ts` | Public loan product data | Reads `banks` and `lender_doc_requirements` |
| `crmDb.ts` | Partner-scoped CRM data | Every lead query filters by `partner_org_id` |
| `adminDb.ts` | Platform-wide admin data | Must only be reachable after admin auth |
| `pgClient.ts` | Pool and query helpers | Raw parameterized SQL, no ORM |

Security rule: never select encrypted sensitive columns such as
`client_pan_number` or `client_aadhaar` into an AI tool response.

## GPS Backend API

Wrapper:

- `src/lib/gpsBridge.ts`

Env:

```env
GPS_INDIA_API_URL=
GPS_INDIA_WEBHOOK_URL=
GPS_SERVICE_TOKEN=
GPS_INTERNAL_TOKEN=
GPS_JWT_PUBLIC_KEY=
GPS_JWT_ISSUER=
GPS_JWT_AUDIENCE=
```

The bridge:

- Adds bearer auth.
- Sets `cache: "no-store"`.
- Converts HTTP failures to `GpsBridgeError`.
- Enforces partner scope in newer wrappers with `assertPartnerScope()`.

The codebase currently has both direct PostgreSQL paths and GPS API bridge
paths. Read the specific tool before assuming which one is used.

## LLM Providers

Router:

- `src/lib/llm/router.ts`

Env:

```env
GEMINI_API_KEY=
GEMINI_MODEL=
OPENROUTER_API_KEY=
OPENROUTER_DEFAULT_MODEL=
OPENROUTER_FREE_MODEL=
OPENROUTER_SITE_URL=
OPENROUTER_APP_NAME=
OPENAI_API_KEY=
OPENAI_MODEL=
CLAUDE_API_KEY=
ANTHROPIC_API_KEY=
CLAUDE_MODEL=
LLM_PROVIDER_ORDER=gemini,openrouter
FIRECRAWL_API_KEY=
```

Direct Gemini usage still exists for embeddings and document analysis:

- `src/lib/embeddings.ts`
- `src/lib/documentAnalyser.ts`

Those require `GEMINI_API_KEY` even if text generation falls back to another
provider.

Firecrawl is used only when the PostgreSQL loan database has no usable answer
for a bank/loan question. Those responses are returned with
`Source: Web search via Firecrawl`.

## ScaleKit

Files:

- `src/lib/ScaleKit.ts`
- `src/lib/getSession.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/callback/route.ts`
- `src/app/api/auth/logout/route.ts`

Env:

```env
SCALEKIT_ENVIRONMENT_URL=
SCALEKIT_CLIENT_ID=
SCALEKIT_CLIENT_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

ScaleKit is only for dashboard/owner sessions. It is separate from partner/admin
GPS JWT auth.

## WhatsApp

Files:

- `src/lib/whatsapp.ts`
- `src/agents/crm/tools/sendWhatsapp.ts`

Env:

```env
ENABLE_WHATSAPP=false
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
```

Behavior:

1. Strip non-digits from phone.
2. Increment `rate:wa:<partnerId>:hour`.
3. Block after 50 sends/hour.
4. If `leadId` exists, check consent through GPS bridge.
5. If `ENABLE_WHATSAPP` is not `"true"`, return `stubbed`.
6. Otherwise call Meta Graph API.
7. Log send/block/stub status through GPS bridge.

## Feature Flags

| Env | Current effect |
| --- | --- |
| `ENABLE_WHATSAPP` | Sends real WhatsApp only when `"true"`; otherwise stubs |
| `ENABLE_SOFT_CHECK` | Present in `softCheckEngine.ts`, but current code does not block when false |
| `ENABLE_MORNING_BRIEF` | Briefing cron route checks this before running |
| `CHAT_ALLOWED_ORIGINS` | Global CORS allowlist for legacy `/api/chat` |
| `CHAT_RATE_LIMIT_MAX` | In-memory legacy chat rate limit max |
| `CHAT_RATE_LIMIT_WINDOW_MS` | In-memory legacy chat rate limit window |

## Environment Checklist

Minimum for basic dashboard and embedded bot work:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
MONGODB_URI=
GEMINI_API_KEY=
SCALEKIT_ENVIRONMENT_URL=
SCALEKIT_CLIENT_ID=
SCALEKIT_CLIENT_SECRET=
```

Add for first-party lending chat with live data:

```env
DATABASE_URL=
REDIS_URL=redis://127.0.0.1:6379
```

Add for authenticated partner/admin paths:

```env
GPS_INDIA_API_URL=
GPS_JWT_PUBLIC_KEY=
GPS_JWT_ISSUER=
GPS_JWT_AUDIENCE=
```

Add for CRM actions:

```env
GPS_SERVICE_TOKEN=
GPS_INDIA_WEBHOOK_URL=
ENABLE_WHATSAPP=false
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
```
