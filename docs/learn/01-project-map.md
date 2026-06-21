# Project Map

## What This Project Is

This is a Next.js App Router application for Myra AI. It combines:

- A multi-tenant embeddable chatbot platform.
- GPS India lending chatbots and copilots.
- Knowledge ingestion and RAG for custom bots.
- Lender/product queries from GPS backend offers, PostgreSQL, or MongoDB fallback data.
- Partner/admin CRM visibility and selected CRM actions.
- Hindi, Hinglish, and English public borrower chat.

## Stack

| Layer | Tech |
| --- | --- |
| Web app | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 via PostCSS, custom CSS variables |
| API validation | Zod in several route handlers |
| LLMs | Gemini, OpenRouter, OpenAI, Claude via one router |
| Database | MongoDB/Mongoose, PostgreSQL `pg`, Redis/ioredis |
| Auth | ScaleKit for dashboard, GPS JWT for partner/admin chat |
| Tests | Vitest in Node environment |
| Deployment shape | Next.js server routes, Dockerfile, docker-compose for local services |

## Top-Level Layout

```text
agent/
  db/
    crm_assistant_schema.sql
  docs/
    learn/
    superpowers/
    *.md
  public/
    widget.js
    *.svg
  src/
    agents/
    app/
    components/
    jobs/
    lib/
    model/
    tests/
    theme/
    types/
  Dockerfile
  docker-compose.yml
  package.json
  vitest.config.mjs
```

## Important Directories

### `src/app`

Next.js App Router pages and route handlers.

High-signal files:

- `src/app/page.tsx`: home page, checks ScaleKit session and onboarding state.
- `src/app/chat/page.tsx`: resolves `mode=web|crm|partner|admin` and renders `ChatClient`.
- `src/app/embed/page.tsx`: iframe target for the embedded widget.
- `src/app/dashboard/*`: authenticated owner dashboard.
- `src/app/api/chat/*`: all first-party chat endpoints.
- `src/app/api/bots/*`: bot CRUD and public widget config.
- `src/app/api/knowledge/*`: knowledge upload, text/url ingestion, source management.
- `src/app/api/auth/*`: ScaleKit login, callback, logout.

### `src/components`

Client components for the UI.

- `HomeClient.tsx`: landing/home UI and navigation.
- `DashboardClient.tsx`: owner settings and shortcuts.
- `ChatClient.tsx`: first-party chat UI for all four modes.
- `Chat/EmbedChat.tsx`: iframe chat UI used by `public/widget.js`.
- `Dashboard/BotsManager.tsx`: create/list bots.
- `Dashboard/BotSettingsClient.tsx`: edit bot and copy embed code.
- `Dashboard/BotKnowledgeClient.tsx`: upload files/text/URLs and watch ingestion status.
- `OnboardingClient.tsx`: first-run bot setup.

### `src/agents`

Agent loops and tool declarations by user role.

- `web`: public borrower lending advisor.
- `partner`: read-only partner pipeline assistant.
- `admin`: read-only platform analytics assistant.
- `crm`: action-capable partner CRM copilot.

Each agent usually has:

- `persona.ts`: prompt and behavioral boundary.
- `agent.ts`: tool declarations, dispatcher, model loop.
- `tools/*`: concrete tool implementations.

### `src/lib`

Shared adapters and business logic.

| File | Responsibility |
| --- | --- |
| `llm/router.ts` | Provider fallback and result normalization |
| `gemini.ts` | Conversation history helpers plus LLM wrapper exports |
| `db.ts` | Mongoose connection cache |
| `pgClient.ts` | PostgreSQL pool and query helpers |
| `chatAuth.ts` | Partner/admin/chat JWT auth |
| `getSession.ts` | ScaleKit session cookie auth |
| `apiSecurity.ts` | CORS and in-memory rate limit utilities |
| `chatCache.ts` | Redis JSON/cache/rate helpers |
| `loanDb.ts` | PostgreSQL lender/product/document queries |
| `crmDb.ts` | Partner-scoped PostgreSQL lead queries |
| `adminDb.ts` | Platform-wide PostgreSQL analytics queries |
| `knowledgeBase.ts` | MongoDB lending product fallback/search |
| `chunker.ts` | Text chunking for RAG |
| `embeddings.ts` | Gemini embedding calls |
| `ingest.ts` | KnowledgeSource to KnowledgeChunk pipeline |
| `retrieval.ts` | Bot RAG retrieval by cosine similarity |
| `gpsBridge.ts` | External GPS backend API wrapper |
| `whatsapp.ts` | Meta WhatsApp send path and safeguards |
| `documentAnalyser.ts` | Gemini document extraction and redaction |
| `softCheckEngine.ts` | Lead soft-check logic |

### `src/model`

Mongoose schemas.

- `Bot.ts`: owner-scoped embedded bot config.
- `ChatSession.ts`: Mongo-backed widget chat history.
- `KnowledgeSource.ts`: uploaded/pasted/crawled knowledge source.
- `KnowledgeChunk.ts`: embedded text chunks for bot RAG.
- `knowledge.model.ts`: lending product collection fallback.
- `settings.model.ts`: owner settings for legacy/general FAQ path.

### `src/tests`

Vitest tests. They mostly mock LLM and DB dependencies so they run quickly.

Useful starting tests:

- `web-agent.test.ts`
- `web-chat-route.test.ts`
- `chat-client.test.ts`
- `compare-products.test.ts`
- `capture-lead.test.ts`
- `partner-chatbot.test.ts`
- `admin-chatbot.test.ts`
- `crm-agent.test.ts`
- `chat-route.test.ts`
- `web-tools-pg.test.ts`
- `chat-auth.test.ts`
- `llm-router.test.ts`

## Files To Read First

If you only have one hour:

1. `src/app/chat/page.tsx`
2. `src/components/ChatClient.tsx`
3. `src/agents/web/agent.ts`
4. `src/agents/partner/agent.ts`
5. `src/agents/admin/agent.ts`
6. `src/agents/crm/agent.ts`
7. `src/lib/gemini.ts`
8. `src/lib/llm/router.ts`
9. `src/lib/chatAuth.ts`
10. `src/app/api/chat/route.ts`

## Current Working-Tree Notes

The app has many uncommitted changes. Treat the current files as the truth for
this guide. Notable current-state facts:

- `src/server/crm-assistant` is deleted in this working tree.
- `public/chatBot.js` is deleted; `public/widget.js` is the current widget.
- `/api/settings/get` appears as a deleted/stale path in file listings; current settings are in `/api/settings`.
- New `admin` and `partner` agents exist and are wired to `/api/chat/admin` and `/api/chat/partner`.
- Public web chat now sends browser-side conversation history to `/api/chat/web`; the route uses it only when Redis has no server history for the session.
- Web language detection is explicit in `src/agents/web/agent.ts`: current Devanagari Hindi returns Hindi, Roman Hindi returns Hinglish, English returns English, and history is only a fallback.
- `compare_products` tries the configured GPS backend match-offers endpoint before local PostgreSQL/MongoDB data.
- `capture_lead` creates backend leads when `GPS_INDIA_API_URL` is configured and required lead fields are present.
- `chatAuth.ts` calls `/api/auth/me`, not the older `/internal/me`, and normalizes the current nested backend response.
- Several docs under `docs/` still describe earlier architecture.
