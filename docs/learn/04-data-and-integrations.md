# Data And Integrations

## Environment Files

Create `.env` from `.env.example`. Never commit real secrets.

Minimum useful local values:

```env
MONGODB_URI=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
LLM_PROVIDER_ORDER=gemini,openrouter
REDIS_URL=redis://127.0.0.1:6379
GPS_INDIA_API_URL=
```

Add dashboard auth when working on `/dashboard`:

```env
SCALEKIT_ENVIRONMENT_URL=
SCALEKIT_CLIENT_ID=
SCALEKIT_CLIENT_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Add CRM actions when needed:

```env
GPS_SERVICE_TOKEN=
GPS_INTERNAL_TOKEN=
ENABLE_WHATSAPP=false
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
ENABLE_MORNING_BRIEF=true
BRIEFING_CRON_SECRET=
```

## MongoDB

Connection:

- `src/lib/db.ts`
- `MONGODB_URI` or `MONGODB_URL`

Main collections:

| Model/file | Purpose |
| --- | --- |
| `Bot.ts` | Custom embedded bot config |
| `ChatSession.ts` | Embedded widget chat history |
| `KnowledgeSource.ts` | Uploaded/pasted/crawled bot source content |
| `KnowledgeChunk.ts` | Embedded chunks for bot retrieval |
| `knowledgeBase.ts` local schema | Lending product fallback data |
| `briefingGenerator.ts` local schema | Stored partner briefings |

## Redis

Connection helpers:

- `src/lib/gemini.ts`
- `src/lib/chatCache.ts`

Common keys:

| Key | Purpose |
| --- | --- |
| `conv:<sessionId>` | First-party assistant chat history |
| `crm:pipeline:<partnerId>` | CRM pipeline cache |
| `crm:commissions:<partnerId>` | CRM commission cache |
| `rate:wa:<partnerId>:hour` | WhatsApp send counter |

Redis failures are often swallowed so local development can continue. If
history or caching looks odd, test once with Redis running and once without it.

## PostgreSQL

Connection:

- `src/lib/pgClient.ts`
- `DATABASE_URL`

The app expects the live GPS schema, including tables like:

- `banks`
- `lender_doc_requirements`
- `leads`
- `lead_documents`
- `lead_timeline`
- `partners`
- `partner_users`
- `users`
- `consent_grants`

The checked-in `db/crm_assistant_schema.sql` is older/demo-oriented and is not
the source of truth for current helpers.

| Helper | Scope |
| --- | --- |
| `loanDb.ts` | Public loan product/document reads |
| `crmDb.ts` | Partner-scoped CRM reads |
| `adminDb.ts` | Platform-wide admin reads |
| `pgClient.ts` | Raw pooled query helper |

Do not select sensitive encrypted fields such as PAN or Aadhaar into an AI tool
response.

## GPS Backend API

Configured with:

```env
GPS_INDIA_API_URL=
GPS_INDIA_WEBHOOK_URL=
GPS_SERVICE_TOKEN=
GPS_INTERNAL_TOKEN=
GPS_JWT_PUBLIC_KEY=
GPS_JWT_ISSUER=
GPS_JWT_AUDIENCE=
```

Used by:

| Caller | Endpoint | Purpose |
| --- | --- | --- |
| `chatAuth.ts` | `GET /api/auth/me` | Resolve GPS JWT identity |
| `compareProducts.ts` | `POST /api/leads/match-offers` | Match public offers |
| `captureLead.ts` | `POST /api/leads` | Create public lead |
| `gpsBridge.ts` | multiple CRM endpoints | Notes, documents, soft checks, logs |

Read the specific tool before assuming whether data comes from GPS API,
PostgreSQL, or MongoDB fallback.

## LLM Providers

Main files:

- `src/lib/llm/router.ts`
- `src/lib/gemini.ts`

Provider env:

```env
GEMINI_API_KEY=
GEMINI_MODEL=
OPENROUTER_API_KEY=
OPENROUTER_DEFAULT_MODEL=
OPENAI_API_KEY=
OPENAI_MODEL=
CLAUDE_API_KEY=
ANTHROPIC_API_KEY=
CLAUDE_MODEL=
LLM_PROVIDER_ORDER=gemini,openrouter
```

The router logs failed providers and tries the next provider. Unit tests mock
providers; live key health must be checked with a real request.

## WhatsApp

Files:

- `src/lib/whatsapp.ts`
- `src/agents/crm/tools/sendWhatsapp.ts`

Behavior:

1. Normalize phone number.
2. Increment hourly Redis counter.
3. Block after the configured send limit.
4. Check lead consent when a lead is involved.
5. Return `stubbed` unless `ENABLE_WHATSAPP=true`.
6. Call Meta Graph API when enabled.
7. Log status through the GPS bridge.

## Feature Flags

| Env | Effect |
| --- | --- |
| `ENABLE_WHATSAPP` | Real WhatsApp sends only when `"true"` |
| `ENABLE_MORNING_BRIEF` | Allows briefing cron to run |
| `CHAT_ALLOWED_ORIGINS` | Legacy `/api/chat` CORS allowlist |
| `CHAT_RATE_LIMIT_MAX` | Legacy chat in-memory rate limit |
| `CHAT_RATE_LIMIT_WINDOW_MS` | Legacy chat rate-limit window |
