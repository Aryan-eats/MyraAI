# Architecture

## Runtime Layers

```text
User or embedded site
  -> React client component or widget iframe
  -> Next.js route handler in src/app/api
  -> one of:
       - bot RAG flow in /api/chat
       - role-specific agent loop in src/agents/*
       - CRUD/ingestion route
  -> shared src/lib adapter
  -> storage or external service
```

The code intentionally keeps most side effects outside prompts. Prompts decide
which tool to call; TypeScript tools enforce actual data access, auth scope, and
external API behavior.

## Main Product Surfaces

| Surface | User | Entry point | Backing flow |
| --- | --- | --- | --- |
| Embedded bot | Visitor on customer site | `public/widget.js` iframe | `/api/chat` with `botId` |
| Bot dashboard | Authenticated owner | `/dashboard`, `/dashboard/bots` | ScaleKit + MongoDB |
| Web lending advisor | Public borrower | `/chat?mode=web`, `/api/chat/web` | Web agent tools |
| Partner chatbot | GPS partner | `/chat?mode=partner`, `/api/chat/partner` | Read-only PostgreSQL tools |
| Admin chatbot | GPS ops/admin | `/chat?mode=admin`, `/api/chat/admin` | Read-only platform tools |
| CRM copilot | GPS partner | `/chat?mode=crm`, `/api/chat/crm` | Action-capable CRM tools |

## Auth Model

### Dashboard and Bot Ownership

Dashboard pages use ScaleKit:

```text
/api/auth/login
  -> ScaleKit authorization URL
/api/auth/callback
  -> ScaleKit token
  -> cookies: access_token, myra_session
getSession()
  -> validate token
  -> scalekit.user.getUser(sub)
```

`src/proxy.ts` protects `/dashboard/:path*` by redirecting missing sessions to
`/login`.

Bot CRUD routes call `getSession()` and scope bot queries by `ownerId`.

### Partner and Admin Chat

Partner/admin chat uses a GPS token from either:

- `Authorization: Bearer <token>`
- `?gpsToken=<token>`

`src/lib/chatAuth.ts` optionally validates JWT signature when
`GPS_JWT_PUBLIC_KEY` is configured. It then resolves identity through
`GPS_INDIA_API_URL/internal/me`.

When `DATABASE_URL` exists:

- Partner auth resolves `partner_org_id` via `resolvePartnerOrgForUser()` in `crmDb.ts`.
- Admin auth checks `users.role` via `getUser()` in `adminDb.ts`.

When PostgreSQL is not configured, partner/admin fallback trusts the GPS `/me`
role and entity.

## LLM Layer

Most code imports from `src/lib/gemini.ts`, but that file delegates generation
to `src/lib/llm/router.ts`.

Current default provider order:

```text
gemini, openrouter
```

Override with:

```env
LLM_PROVIDER_ORDER=gemini,openrouter,openai,claude
```

Provider defaults in code:

| Provider | Default model/env |
| --- | --- |
| Gemini | `GEMINI_MODEL` or `gemini-2.5-flash` |
| OpenRouter | `OPENROUTER_DEFAULT_MODEL` or `OPENROUTER_FREE_MODEL` or `meta-llama/llama-3.3-70b-instruct:free` |
| OpenAI | `OPENAI_MODEL` or `gpt-4o-mini` |
| Claude | `CLAUDE_MODEL` or `claude-3-7-sonnet-latest` |

The router normalizes Gemini, OpenAI/OpenRouter, and Claude responses into one
Gemini-like shape:

```ts
{
  text?: string
  candidates: [{ content: { parts: [{ text? }, { functionCall? }] } }]
}
```

That lets all agent loops inspect only `parts`, `text`, and `functionCall`.

## State

| Store | Used for | Code |
| --- | --- | --- |
| MongoDB | Bots, bot knowledge, widget sessions, settings, lending fallback, briefings | `src/model/*`, `src/lib/db.ts` |
| Redis | First-party chat history, cache, WhatsApp rate counters | `src/lib/gemini.ts`, `src/lib/chatCache.ts` |
| PostgreSQL | Live GPS banks, docs, leads, partners, users | `src/lib/pgClient.ts`, `loanDb.ts`, `crmDb.ts`, `adminDb.ts` |
| GPS API | Legacy/CRM bridge calls and service auth flows | `src/lib/gpsBridge.ts` |
| Meta WhatsApp | Template sends | `src/lib/whatsapp.ts` |

## Data Flow Patterns

### Embedded Bot RAG

```text
widget.js
  -> /embed?botId=...
  -> EmbedChat
  -> POST /api/chat { botId, message, sessionId }
  -> Bot lookup in Mongo
  -> retrieveRelevantChunks(botId, message)
  -> generateText()
  -> append ChatSession messages in Mongo
```

### First-Party Agent Chat

```text
ChatClient
  -> POST /api/chat/<mode>
  -> load Redis history conv:<sessionId>
  -> run<Mode>Agent(message, history, auth?)
  -> generateWithTools()
  -> execute tool calls
  -> save Redis history
```

### Knowledge Ingestion

```text
POST /api/knowledge/upload or /api/knowledge/text
  -> create KnowledgeSource(status=pending)
  -> fire ingestSource(sourceId) without await
  -> route returns 202

ingestSource()
  -> status=processing
  -> parse/chunk text
  -> embed chunks with Gemini
  -> replace KnowledgeChunk rows
  -> status=ready or failed
```

## Security Boundaries

These are the boundaries the code tries to enforce:

- Partner queries must always filter by `partner_org_id`.
- Admin queries can see platform-wide data only after admin-role auth.
- CRM action tools receive `AuthenticatedPartner` and call scoped bridge helpers.
- Document analysis redacts Aadhaar/PAN/account-like fields before returning structured data.
- WhatsApp sends check rate limits and consent before the Meta API path.

Known issues to keep in mind:

- Knowledge routes currently accept `botId` without verifying the owner session.
- `/api/settings` trusts `ownerId` from the request rather than deriving it from session.
- `Bot.allowedDomains` is stored but not the main enforcement point for `/api/chat`; global `CHAT_ALLOWED_ORIGINS` is used there.
- `docker-compose.yml` sets `POSTGRES_URL`, but current PostgreSQL code reads `DATABASE_URL`.
- `db/crm_assistant_schema.sql` does not match the live-schema tables used by `loanDb.ts`, `crmDb.ts`, and `adminDb.ts`.

## Where Complexity Lives

Most changes become simple if you pick the right layer:

| Change | Start here |
| --- | --- |
| Prompt wording or safety behavior | `src/agents/*/persona.ts` |
| Add tool to an agent | `src/agents/<mode>/agent.ts` plus `tools/*` |
| Change provider fallback | `src/lib/llm/router.ts` |
| Change public bot answers | `/api/chat` bot flow and retrieval |
| Change lender/product data behavior | `src/lib/loanDb.ts`, `src/lib/knowledgeBase.ts` |
| Change partner data visibility | `src/lib/crmDb.ts`, `src/lib/chatAuth.ts` |
| Change admin data visibility | `src/lib/adminDb.ts`, `src/lib/chatAuth.ts` |
| Change widget UI | `public/widget.js`, `src/components/Chat/EmbedChat.tsx` |

