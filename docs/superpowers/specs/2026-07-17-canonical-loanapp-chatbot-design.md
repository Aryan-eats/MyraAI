# Canonical LoanApp Chatbot Design

## Status and source of truth

This design covers two working directories:

- `C:\Users\risha\OneDrive\Desktop\agent\agent`: a separately hosted Next.js chat UI.
- `C:\Users\risha\OneDrive\Desktop\loan-app\.worktrees\chat-bot`: the canonical LoanApp chatbot backend and its existing LoanApp widgets.

The LoanApp worktree is the chatbot source of truth. It does not import `/agent/agent` or call it at runtime. `/agent/agent` will call LoanApp over HTTPS.

## Goals

1. Reduce `/agent/agent` to a separately deployable chat screen.
2. Remove ScaleKit, partner onboarding, dashboards, custom bots, embedded widgets, MongoDB, Redis, local PostgreSQL access, local LLM execution, and standalone CRM/admin implementations from `/agent/agent`.
3. Use LoanApp's `/api/assistant` implementation for the public chat screen and existing LoanApp public, partner, and admin widgets.
4. Answer loan, banking, finance, and CRM questions from authorized PostgreSQL data first.
5. Use Firecrawl only for relevant external questions that the configured database cannot answer.
6. Clearly mark web-grounded answers and require administrator confirmation.
7. Allow optional Google OAuth on the separately hosted chat screen without putting chatbot users in LoanApp's `users` table.
8. Keep all existing LoanApp partner/admin scoping, CRM tools, WhatsApp behavior, governance, and audit behavior intact.

## Non-goals

- The chatbot will not answer unrelated general-interest questions.
- Internal profile, lead, document, commission, or organization queries will never fall back to public web search.
- Chatbot OAuth users will not become LoanApp partners or receive CRM permissions.
- Existing LoanApp partner onboarding will not be removed or changed.
- Existing LoanApp users, roles, OAuth accounts, and permissions will not be migrated into chatbot-user tables.
- No new authentication vendor or shared cross-repository package will be introduced.

## Runtime architecture

Both hosted UIs call the same LoanApp backend:

```text
chat.gpsindia.com (agent/agent) ----\
                                      -> api.gpsindia.com/api/assistant/*
LoanApp public/partner/admin UI -----/
```

The chat UI and API are separately deployed but use same-site subdomains. LoanApp allows the exact chat UI origin through CORS. The public UI calls LoanApp directly; `/agent/agent` does not proxy or duplicate model execution.

If LoanApp is unavailable, the chat UI reports that the service is unavailable. There is no second chatbot backend.

## Authentication

### Anonymous public chat

Anonymous users remain supported. The browser generates an opaque UUID `sessionId`. LoanApp owns the conversation by `scope = public` plus `sessionId`.

### Authenticated chatbot users

LoanApp adds chat-specific Google OAuth endpoints under `/api/auth/chat`. They reuse the existing OAuth primitives (Google authorization, PKCE, state validation, and verified identity parsing) but have separate persistence and sessions.

New tables:

```text
chat_users
  id uuid primary key
  email unique
  first_name
  last_name
  oauth_provider
  oauth_provider_user_id
  is_active
  is_email_verified
  last_login
  created_at
  updated_at

chat_auth_sessions
  id uuid primary key
  chat_user_id -> chat_users.id
  refresh_token_hash
  expires_at
  revoked_at
  created_at
```

Google-only identity fields live directly on `chat_users`; a separate OAuth-account table is unnecessary until multiple providers are required.

Chat authentication uses:

- A separate refresh-cookie name and `/api/auth/chat` cookie path.
- A separate JWT audience/principal type so chat tokens cannot authenticate LoanApp CRM/admin routes.
- Separate signing secrets for chat access and refresh tokens.
- HTTP-only, secure, same-site cookies shared through requests to the API subdomain.
- Access tokens held in browser memory, not local storage.

Chat OAuth redirects back to `CHAT_FRONTEND_URL`, never `/onboarding` or `/partner`.

### LoanApp users

LoanApp partner/admin users continue using the existing `users`, `oauth_accounts`, roles, permissions, and authentication endpoints. The existing LoanApp widgets continue deriving `partner` or `admin` scope from those identities.

## Conversation persistence

PostgreSQL remains the only conversation source of truth.

`assistant_conversations` gains nullable `chat_user_id -> chat_users.id` while retaining:

- `session_id` for anonymous public conversations.
- `user_id` for existing LoanApp partner/admin conversations.
- `partner_org_id` for partner isolation.
- `lead_id` for an optional related lead.

Ownership rules:

| Principal | Required ownership fields |
| --- | --- |
| Anonymous public | `scope = public`, matching `session_id`, no `chat_user_id` |
| Authenticated chatbot user | `scope = public`, matching `chat_user_id` |
| LoanApp partner/admin | matching `scope` and `user_id`; partner tools also enforce `partner_org_id` |

Every request:

1. Validates conversation ownership.
2. Creates the conversation if necessary.
3. Inserts the user message.
4. Loads bounded recent history.
5. Runs the model and at most one server-allowlisted tool.
6. Inserts the assistant message with provider, model, tool, token, and source metadata.
7. Explicitly updates the conversation's `updated_at`.

Conversation history endpoints return only conversations owned by the active anonymous session, chat user, or LoanApp user. Deleting a conversation cascades to messages. Retention cleanup continues deleting conversations by scope and age.

## Assistant scopes and data access

### Public and authenticated chatbot users

Public tools include:

- Loan/finance knowledge lookup.
- Lender matching and comparison.
- Lender document requirements.
- EMI calculation.
- Indicative FOIR eligibility calculation.
- Consent-gated lead capture.
- Safe authenticated chat-profile lookup when a chat user is signed in.

### LoanApp partner/admin users

Existing CRM tools remain. They continue using LoanApp permission checks and partner-organization filters for leads, documents, timelines, soft checks, metrics, commissions, and follow-up context.

A safe authenticated-profile tool returns only authorized fields:

- Name, email, verified phone/profile state.
- Role and effective permissions.
- Location and non-sensitive business profile.
- Partner organization and membership where applicable.
- Onboarding/KYC state where applicable.
- Authorized CRM summaries available through existing scoped tools.

It never returns password fields, refresh tokens, OTP data, reset tokens, PAN, Aadhaar, account numbers, encryption material, internal secrets, or another user's unauthorized data.

## Database-first and web-search policy

LoanApp's knowledge tool performs one server-controlled operation:

1. Search configured PostgreSQL lender, document, and active verified chatbot-knowledge data.
2. If that data provides a useful answer, return it without web search.
3. If it does not and the query concerns loans, banking, finance, or general CRM practice, call Firecrawl.
4. Reject unrelated topics.

The current one-tool-per-turn model loop remains. Database lookup and Firecrawl fallback happen inside the same knowledge tool, so no multi-tool agent loop is required.

Before Firecrawl, the server rejects or removes profile data, phone/email values, PAN/Aadhaar/account-like values, internal UUIDs, CRM row contents, and other sensitive identifiers. Internal account/CRM questions never use web fallback.

Every web-grounded answer is enforced server-side to include:

```text
*Web search*

This information was not available in the configured database. Please confirm it with an administrator before relying on it.
```

It also includes source URLs and stores web-source metadata with the assistant message. If Firecrawl fails or returns no useful sources, the assistant says it could not verify the answer instead of inventing one.

## `/agent/agent` end state

Keep only:

- The chat page and message formatting.
- Anonymous session and conversation identifiers.
- Google sign-in/sign-out UI and chat-auth API client.
- LoanApp assistant/history API client.
- Minimal Next.js, React, styling, and tests.

Remove:

- ScaleKit and all ScaleKit auth routes.
- Partner login/onboarding.
- Dashboard, bot creation, bot settings, analytics, and bot knowledge management.
- `/embed`, `public/widget.js`, custom bot APIs, and legacy bot-specific `/api/chat`.
- `Bot`, `ChatSession`, `KnowledgeSource`, `KnowledgeChunk`, settings, and other Mongoose models.
- MongoDB/Mongoose, Redis, PostgreSQL clients, local knowledge ingestion/retrieval, local agents, local LLM routing, CRM/admin modes, WhatsApp, briefings, cron routes, and duplicate LoanApp bridges.

No MongoDB dependency remains in `/agent/agent`. LoanApp already uses PostgreSQL/Prisma for this chatbot and has no MongoDB chatbot dependency.

## LoanApp behavior preserved

The following behavior remains unchanged except where explicitly extended above:

- Existing LoanApp partner onboarding.
- Partner/admin roles and permissions.
- Partner organization scoping.
- CRM lead, document, metric, commission, follow-up, and soft-check tools.
- WhatsApp connection, consent, preview, confirmation, rate limiting, delivery, and audit flows.
- Chatbot config/persona/knowledge governance and emergency stop.
- Existing LoanApp UI placement of public, partner, and admin assistant widgets.

## Configuration

LoanApp adds placeholders for:

- `CHAT_FRONTEND_URL`
- `CHAT_JWT_SECRET`
- `CHAT_REFRESH_JWT_SECRET`
- `GOOGLE_CHAT_OAUTH_REDIRECT_URI`
- `FIRECRAWL_API_KEY`

LoanApp's `ALLOWED_ORIGINS` includes the exact hosted chat origin. Google OAuth configuration includes the chat callback URI. `/agent/agent` uses a public LoanApp API base URL and contains no database or model-provider secrets.

## Documentation

`/agent/agent/docs/learn` will be updated to:

- Describe the final thin-client architecture.
- Explain that LoanApp is canonical and independently deployed.
- Document all LoanApp integration files, routes, tools, persistence, authentication, environment variables, scripts, tests, and operational flows.
- Correct stale `ChatClient.tsx` references to `ChatWorkspace.tsx` or its simplified replacement.
- Record removed legacy surfaces and their LoanApp replacements.
- Warn that the documented LoanApp source is the `loan-app/.worktrees/chat-bot` worktree until committed upstream.

## Verification

Small focused tests will cover:

- Google chat OAuth state/PKCE, user creation, repeat login, disabled users, refresh, logout, and redirect behavior.
- Chat tokens being rejected by LoanApp CRM/admin authentication.
- Anonymous, authenticated chat-user, partner, and admin conversation ownership.
- Conversation listing/history isolation and `updated_at` maintenance.
- Safe profile-field selection and sensitive-field exclusion.
- Partner organization and admin permission isolation.
- Database-first knowledge lookup.
- Loan/finance/CRM topic restriction.
- PII/identifier rejection before Firecrawl.
- Mandatory web-search marking, sources, and administrator-confirmation notice.
- FOIR and existing public tools.
- CORS for the exact hosted chat origin.
- `/agent/agent` UI request/auth behavior.
- Type checking, unit tests, and production builds in both repositories.

## Migration and rollout

1. Add LoanApp schema, OAuth, assistant, web-search, and tests without changing existing partner/admin behavior.
2. Run Prisma migration and verify anonymous plus authenticated LoanApp assistant flows.
3. Point `/agent/agent` at LoanApp and verify OAuth/CORS from the separate origin.
4. Remove unused `/agent/agent` backend and management files/dependencies.
5. Update Learn documentation and run final verification in both repositories.

The rollout keeps anonymous chat working while authenticated chat is added. No existing LoanApp user records are migrated or rewritten.
