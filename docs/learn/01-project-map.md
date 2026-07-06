# Project Map

## What This Project Is

This is a Next.js App Router application for an AI loan assistant and CRM
assistant.

It contains four first-party assistant modes:

| Mode | Audience | Purpose | Endpoint |
| --- | --- | --- | --- |
| `web` | Public borrower | Loan FAQs, product comparison, EMI, eligibility, lead capture | `/api/chat/web` |
| `crm` | Authenticated partner CRM user | CRM actions, documents, WhatsApp, soft checks, briefings | `/api/chat/crm` |
| `partner` | Authenticated partner viewer | Read-only pipeline and commission questions | `/api/chat/partner` |
| `admin` | Authenticated admin/ops user | Read-only platform analytics | `/api/chat/admin` |

It also has an older embeddable bot/dashboard module:

- `/dashboard` manages custom bots and knowledge.
- `/embed` and `public/widget.js` render an embeddable chat widget.
- `/api/chat` answers with bot-specific retrieved knowledge when `botId` is
  supplied.

## Stack

| Layer | Tech |
| --- | --- |
| App | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 and global CSS variables |
| LLMs | Gemini, OpenRouter, OpenAI, Claude through one router |
| Storage | MongoDB/Mongoose, PostgreSQL, Redis |
| Auth | GPS JWT for assistant modes, ScaleKit for dashboard |
| Tests | Vitest |

## Repository Layout

```text
agent/
  docs/learn/              onboarding docs
  public/widget.js         embeddable bot widget
  src/app/                 Next.js pages and API routes
  src/agents/              LLM agent loops and tools
  src/components/          React UI
  src/lib/                 shared adapters and business logic
  src/model/               Mongoose models
  src/tests/               Vitest tests
  package.json
```

## Important Directories

### `src/app`

Next.js pages and route handlers.

High-signal files:

- `src/app/chat/page.tsx`: chooses `web`, `crm`, `partner`, or `admin` mode.
- `src/app/api/chat/web/route.ts`: public loan chatbot API.
- `src/app/api/chat/crm/route.ts`: action-capable CRM assistant API.
- `src/app/api/chat/partner/route.ts`: read-only partner assistant API.
- `src/app/api/chat/admin/route.ts`: read-only admin assistant API.
- `src/app/api/chat/route.ts`: older embeddable bot and legacy chat route.
- `src/app/api/webhooks/briefing-cron/route.ts`: scheduled briefing endpoint.
- `src/app/api/partner/briefing/today/route.ts`: today's partner briefing.

### `src/agents`

Each assistant has a folder:

```text
src/agents/<mode>/
  agent.ts       model loop, tool declarations, dispatch
  persona.ts     prompt and behavioral rules
  tools/         real TypeScript work the model may request
```

The key design rule: the model can request a tool, but the tool owns real
permissions, validation, and data access.

### `src/lib`

Shared infrastructure and business logic.

| File | Job |
| --- | --- |
| `llm/router.ts` | LLM provider fallback and normalized response shape |
| `gemini.ts` | Chat history helpers and generation exports |
| `chatAuth.ts` | GPS JWT partner/admin authentication |
| `loanDb.ts` | Public loan data from PostgreSQL |
| `crmDb.ts` | Partner-scoped CRM queries |
| `adminDb.ts` | Platform analytics queries |
| `gpsBridge.ts` | Calls into the GPS backend |
| `whatsapp.ts` | WhatsApp send, consent, and rate-limit path |
| `documentAnalyser.ts` | Document extraction and redaction |
| `softCheckEngine.ts` | Lead soft-check rules |
| `briefingGenerator.ts` | Morning briefing generation and storage |
| `knowledgeBase.ts` | Mongo lending product fallback search |

### `src/model`

MongoDB/Mongoose models.

- `Bot.ts`: custom bot configuration.
- `ChatSession.ts`: embedded widget chat history.
- `KnowledgeSource.ts`: uploaded/pasted/crawled source material.
- `KnowledgeChunk.ts`: embedded chunks for bot RAG.
- `knowledge.model.ts`: older FAQ knowledge documents.
- `settings.model.ts`: dashboard owner settings.

## Files To Read First

If you have one hour:

1. `src/app/chat/page.tsx`
2. `src/components/ChatClient.tsx`
3. `src/app/api/chat/web/route.ts`
4. `src/agents/web/agent.ts`
5. `src/agents/crm/agent.ts`
6. `src/lib/chatAuth.ts`
7. `src/lib/gpsBridge.ts`
8. `src/lib/llm/router.ts`

## What To Ignore At First

- `docs/superpowers`: agent workflow notes, not product docs.
- `db/crm_assistant_schema.sql`: older/demo schema, not the live GPS schema.
- Older `docs/*.md` files may mention deleted paths. Prefer `docs/learn`.
