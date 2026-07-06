# Architecture

## Runtime Shape

```text
User
  -> React UI
  -> Next.js API route
  -> assistant agent loop
  -> tool function
  -> database or external service
  -> model formats final answer
```

Most business rules are outside the prompt. Prompts describe behavior, but
routes and tools enforce authentication, partner scope, consent, rate limits,
and sensitive-data redaction.

## Product Surfaces

| Surface | User | Entry | Backend flow |
| --- | --- | --- | --- |
| Loan chatbot | Borrower | `/chat?mode=web` | `/api/chat/web` -> `src/agents/web` |
| CRM assistant | Partner CRM user | `/chat?mode=crm` | `/api/chat/crm` -> `src/agents/crm` |
| Partner assistant | Partner viewer | `/chat?mode=partner` | `/api/chat/partner` -> `src/agents/partner` |
| Admin assistant | Admin/ops | `/chat?mode=admin` | `/api/chat/admin` -> `src/agents/admin` |
| Embedded bot | External site visitor | `public/widget.js` iframe | `/api/chat` with `botId` |
| Bot dashboard | Bot owner | `/dashboard` | ScaleKit + MongoDB |

## Authentication

### Public loan chatbot

`/api/chat/web` is public. It can answer loan questions and capture leads, but
it must not read private CRM data or ask for Aadhaar, PAN, bank account numbers,
or OTPs.

### CRM and partner assistants

`/api/chat/crm` and `/api/chat/partner` require a GPS JWT:

```text
Authorization: Bearer <gps-jwt>
```

`src/lib/chatAuth.ts`:

1. Optionally verifies JWT signature when `GPS_JWT_PUBLIC_KEY` is configured.
2. Calls `GPS_INDIA_API_URL/api/auth/me`.
3. Normalizes the GPS user payload.
4. Resolves partner organization scope when PostgreSQL is configured.

Partner-scoped tools must filter by `partner_org_id`.

### Admin assistant

`/api/chat/admin` also uses GPS JWT auth. Admin tools are read-only but can view
platform-wide data after admin-role validation.

### Dashboard

`/dashboard` uses ScaleKit session cookies through `src/lib/getSession.ts` and
`src/proxy.ts`. This is separate from GPS JWT auth.

## LLM Provider Layer

Most generation goes through:

- `src/lib/gemini.ts`
- `src/lib/llm/router.ts`

Default provider order:

```env
LLM_PROVIDER_ORDER=gemini,openrouter
```

The router can also use OpenAI and Claude when configured. It normalizes all
provider responses into a Gemini-like shape so each agent loop can inspect text
and function calls the same way.

Direct Gemini calls still exist for:

- Embeddings: `src/lib/embeddings.ts`
- Document analysis: `src/lib/documentAnalyser.ts`

## State

| Store | Used for |
| --- | --- |
| MongoDB | Bot configs, widget sessions, bot knowledge, lending fallback, briefings |
| Redis | First-party chat history, short-lived cache, WhatsApp rate counters |
| PostgreSQL | Live GPS loan, lead, partner, user, commission-style data |
| GPS backend API | Auth identity, offer matching, lead creation, CRM bridge calls |

Redis outages usually degrade history/cache behavior instead of stopping local
development. MongoDB and LLM provider keys are required for many flows.

## First-Party Chat Flow

```text
ChatClient
  -> POST /api/chat/<mode>
  -> route validates/authenticates
  -> route loads Redis history
  -> run<Mode>Agent()
  -> model may request a tool
  -> TypeScript executes the tool
  -> model writes final answer
  -> route saves history
```

CRM mode can run multiple tool calls in a loop. Web mode is intentionally
simpler and handles one tool call before producing the final answer.

## Security Boundaries

Keep these rules intact:

- Public web chat has no CRM access.
- Partner tools must enforce partner organization scope in code.
- Admin tools stay behind admin auth.
- WhatsApp sends must check consent and rate limits.
- Document analysis must redact sensitive IDs before returning data to the model.
- Prompt text is not a security boundary.

Known hardening items:

- Some older dashboard knowledge routes should verify bot ownership more
  strictly before production multi-tenant use.
- `Bot.allowedDomains` exists, but global `CHAT_ALLOWED_ORIGINS` is still the
  main legacy chat CORS gate.
- `docker-compose.yml` and the checked-in SQL schema do not fully match the live
  PostgreSQL schema expected by the app.
