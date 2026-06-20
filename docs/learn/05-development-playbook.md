# Development Playbook

## Install And Run

```bash
npm install
npm run dev
```

The dev server defaults to:

```text
http://localhost:3000
```

Useful checks:

```bash
npm test
npm run build
npm run lint
```

Seed MongoDB lending fallback data:

```bash
npx tsx src/jobs/seedKnowledge.ts
```

`tsx` is not listed as a direct dependency in `package.json`, so `npx` may need
network access the first time.

## Local Services

There is a `docker-compose.yml` with Redis and PostgreSQL. Redis matches the
current app. PostgreSQL does not fully match current code until these are fixed:

- The app reads `DATABASE_URL`, but compose sets `POSTGRES_URL`.
- The mounted SQL schema is not the real GPS schema expected by `loanDb.ts`,
  `crmDb.ts`, and `adminDb.ts`.

For local work, either point `DATABASE_URL` at the real/dev GPS database, or
add a local schema that matches the current helper queries.

## Test Strategy

Vitest config:

- `vitest.config.mjs`
- Node environment.
- Alias `@` to `src`.
- Includes `src/tests/**/*.test.ts`.

Run everything:

```bash
npm test
```

Run one file:

```bash
npx vitest run src/tests/web-agent.test.ts
```

Current tests mostly mock LLMs and databases. That is good for fast behavior
checks, but it does not prove live service credentials or live database schema.

## Common Change Patterns

### Add A Web-Agent Tool

Files usually touched:

- `src/agents/web/tools/<tool>.ts`
- `src/agents/web/agent.ts`
- `src/agents/web/persona.ts`
- `src/tests/web-agent.test.ts` or a focused tool test

Steps:

1. Implement the tool as a plain function.
2. Add a function declaration in `getWebToolDeclarations()`.
3. Add an `executeWebTool()` branch.
4. Tell the persona when to use it.
5. Add one test for the routing or tool behavior.

### Add A Partner/Admin Tool

Files usually touched:

- `src/agents/partner/*` or `src/agents/admin/*`
- `src/lib/crmDb.ts` or `src/lib/adminDb.ts`
- `src/tests/partner-chatbot.test.ts` or `src/tests/admin-chatbot.test.ts`

Keep partner tools scoped to `partnerOrgId`. Keep admin tools behind
`requireAdminAuth()`.

### Add A CRM Action Tool

Files usually touched:

- `src/agents/crm/tools/<tool>.ts`
- `src/agents/crm/agent.ts`
- `src/agents/crm/persona.ts`
- `src/lib/gpsBridge.ts` or a DB helper
- `src/tests/crm-agent.test.ts`

For action tools, do not rely on model wording for safety. Enforce scope,
consent, rate limits, and validation in TypeScript.

### Add A Route Handler

Follow the better existing routes:

- Validate request body with Zod.
- Return stable `{ error, code }` shapes for client-handled errors.
- Set `export const runtime = "nodejs"` if importing `pg`, `pdf-parse`,
  `mammoth`, or other Node-only modules.
- Derive auth identity server-side. Do not trust `ownerId` from the body for new
  protected routes.

### Add Or Change Knowledge Ingestion

Files:

- `src/app/api/knowledge/upload/route.ts`
- `src/app/api/knowledge/text/route.ts`
- `src/app/api/knowledge/[botId]/route.ts`
- `src/lib/parsers.ts`
- `src/lib/chunker.ts`
- `src/lib/embeddings.ts`
- `src/lib/ingest.ts`

Remember that ingestion is async fire-and-forget from the route. The UI polls
the source list until status becomes `ready` or `failed`.

## Gotchas

| Gotcha | Why it matters |
| --- | --- |
| Web mode only handles one tool call | Multi-step web answers need a loop change |
| CRM mode throws on loop exhaustion | Route returns 500 if the model never emits final text |
| Redis failures are swallowed | Local behavior may differ from production history/cache |
| `allowedDomains` is stored but not fully enforced | Do not assume per-bot embed domain protection exists |
| Knowledge routes lack owner auth | Fix before production multi-tenant use |
| `db/crm_assistant_schema.sql` is not current live schema | Do not test `loanDb.ts` against it |
| `GPS_JWT_PUBLIC_KEY` is optional | Without it, JWT signature validation is skipped |
| Direct Gemini calls remain | Embeddings/docs can fail even if text LLM fallback works |

## Code Style In This Repo

The useful local patterns:

- Small helper modules in `src/lib`.
- Agent tools return structured data, not prose.
- The model formats final user-facing prose.
- Routes own HTTP status codes.
- Tools own data validation/scope.
- Tests mock external services at module boundaries.

Avoid adding framework around one implementation. A new helper is worth it only
when two call sites actually share it or when it protects a security boundary.

## Before You Finish A Change

Run the smallest check that proves your change:

```bash
npm test
```

For route or build-sensitive work:

```bash
npm run build
```

For UI work, start the dev server and manually exercise the route/page you
changed.

