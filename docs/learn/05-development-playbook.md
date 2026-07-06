# Development Playbook

## Install And Run

```bash
npm install
npm run dev
```

Default local URL:

```text
http://localhost:3000
```

Useful checks:

```bash
npm test
npm run build
npm run lint
```

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`:

```bash
npm.cmd test
```

## Local Services

`docker-compose.yml` provides local Redis and PostgreSQL containers. Redis
matches the app. PostgreSQL needs care because current code reads
`DATABASE_URL` and expects the live GPS schema, not the older checked-in SQL
file.

For realistic lending/CRM testing, point `DATABASE_URL` and `GPS_INDIA_API_URL`
at a real dev backend.

## Tests

Vitest config:

- `vitest.config.mjs`
- Tests live in `src/tests/**/*.test.ts`.
- External LLM, DB, and API calls are usually mocked.

Run all tests:

```bash
npm test
```

Run a focused file:

```bash
npx vitest run src/tests/web-agent.test.ts
```

## Common Changes

### Change public loan chatbot behavior

Start with:

- `src/agents/web/persona.ts`
- `src/agents/web/agent.ts`
- `src/agents/web/tools/*`
- `src/app/api/chat/web/route.ts`

Add or update one focused test, usually in:

- `src/tests/web-agent.test.ts`
- `src/tests/web-chat-route.test.ts`
- `src/tests/compare-products.test.ts`
- `src/tests/capture-lead.test.ts`

### Add a web-agent tool

1. Add the tool function in `src/agents/web/tools`.
2. Add its declaration in `getWebToolDeclarations()`.
3. Add dispatch in the web agent.
4. Update the persona only if the model needs a new usage rule.
5. Add one focused test.

### Change CRM assistant behavior

Start with:

- `src/agents/crm/agent.ts`
- `src/agents/crm/persona.ts`
- `src/agents/crm/tools/*`
- `src/lib/gpsBridge.ts`
- `src/tests/crm-agent.test.ts`

For write actions, enforce scope, consent, validation, and logging in code.

### Change partner/admin read behavior

Partner files:

- `src/agents/partner/*`
- `src/lib/crmDb.ts`
- `src/tests/partner-chatbot.test.ts`

Admin files:

- `src/agents/admin/*`
- `src/lib/adminDb.ts`
- `src/tests/admin-chatbot.test.ts`

Keep partner queries scoped. Keep admin queries behind admin auth.

### Change LLM provider behavior

Start with:

- `src/lib/llm/router.ts`
- `src/tests/llm-router.test.ts`

Do not add provider-specific handling inside each agent unless there is no
cleaner router-level fix.

## Gotchas

| Gotcha | Why it matters |
| --- | --- |
| Web mode handles one tool call | Multi-step public answers need an agent-loop change |
| CRM mode can loop up to 8 iterations | A missing final model answer can become a route error |
| Redis failures are often swallowed | Local chat history may differ from production |
| `GPS_JWT_PUBLIC_KEY` is optional | Without it, signature verification is skipped |
| `GPS_INDIA_API_URL` changes web behavior | Offer matching and lead capture use backend first |
| `DATABASE_URL` controls PostgreSQL paths | Without it, tools use fallbacks or return limited data |
| Gemini is still used directly | Embeddings and document analysis need `GEMINI_API_KEY` |
| `db/crm_assistant_schema.sql` is stale | Do not use it as the live schema reference |

## Before Finishing A Change

Run the smallest check that proves the change:

```bash
npm test
```

For route, dependency, or build-sensitive work:

```bash
npm run build
```

For UI changes, start the dev server and exercise the changed page manually.
