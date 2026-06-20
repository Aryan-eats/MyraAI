# Learn This Repository

This folder is a study guide for onboarding onto the current working tree of
the Myra AI app. It assumes your shell is inside the app root:

```bash
cd agent
```

The outer workspace also has a directory named `agent`; the real Next.js app,
`package.json`, `src/`, and this `docs/learn` folder are inside that nested app.

## Mental Model

Myra AI has two product shapes in one Next.js codebase:

1. Embedded bot platform: dashboard users create bots, add knowledge, copy
   `public/widget.js`, and the widget calls `/api/chat` with a `botId`.
2. GPS India lending assistants: first-party chat modes for public borrowers,
   partners, admins, and CRM operations.

The important split is this:

```text
Browser UI
  -> Next.js route handlers in src/app/api
  -> agent loops in src/agents or bot RAG in /api/chat
  -> shared lib adapters in src/lib
  -> MongoDB, Redis, PostgreSQL, GPS API, Gemini/OpenRouter/OpenAI/Claude
```

## Reading Order

Read these in order:

1. [01-project-map.md](01-project-map.md): where things live and what to read first.
2. [02-architecture.md](02-architecture.md): runtime architecture, auth, state, and risk boundaries.
3. [03-chat-flows.md](03-chat-flows.md): every chat mode from request to response.
4. [04-data-and-integrations.md](04-data-and-integrations.md): databases, env vars, external services.
5. [05-development-playbook.md](05-development-playbook.md): setup, tests, common change patterns.
6. [06-reading-checklist.md](06-reading-checklist.md): practical exercises to verify understanding.

## Current Repo Caveat

Some older docs in `docs/` are stale. In particular, references to
`src/server/crm-assistant`, `public/chatBot.js`, and `/api/crm-assistant` do not
match the current working tree because those files are deleted or absent here.

This guide documents the code that exists now.

## Fast Summary

| Area | Main files |
| --- | --- |
| App shell | `src/app/page.tsx`, `src/app/chat/page.tsx`, `src/app/dashboard/*` |
| Chat UI | `src/components/ChatClient.tsx`, `src/components/Chat/EmbedChat.tsx` |
| Embedded widget | `public/widget.js`, `/embed`, `/api/chat` with `botId` |
| Web lending agent | `src/agents/web/*`, `/api/chat/web` |
| Partner chatbot | `src/agents/partner/*`, `/api/chat/partner` |
| Admin chatbot | `src/agents/admin/*`, `/api/chat/admin` |
| CRM copilot | `src/agents/crm/*`, `/api/chat/crm` |
| LLM routing | `src/lib/gemini.ts`, `src/lib/llm/router.ts` |
| MongoDB | `src/lib/db.ts`, `src/model/*`, `src/lib/knowledgeBase.ts` |
| PostgreSQL | `src/lib/pgClient.ts`, `src/lib/loanDb.ts`, `src/lib/crmDb.ts`, `src/lib/adminDb.ts` |
| Redis | `src/lib/gemini.ts`, `src/lib/chatCache.ts` |
| Auth | `src/lib/getSession.ts`, `src/lib/chatAuth.ts`, `src/proxy.ts` |

