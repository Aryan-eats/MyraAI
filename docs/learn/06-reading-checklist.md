# Reading Checklist

Use this as a hands-on onboarding plan. Do not just read files; run one small
experiment per section.

## Day 1: Find The Entry Points

Read:

- `src/app/page.tsx`
- `src/app/chat/page.tsx`
- `src/components/ChatClient.tsx`
- `src/components/Chat/EmbedChat.tsx`
- `public/widget.js`

Verify:

- Explain how `/chat?mode=partner` becomes a POST to `/api/chat/partner`.
- Explain why embedded widget messages go to `/api/chat`, not `/api/chat/web`.
- Find where the pasted GPS JWT is sent.

Small experiment:

```bash
npm test -- src/tests/middleware.test.ts
```

## Day 2: Understand The Agents

Read:

- `src/agents/web/agent.ts`
- `src/agents/web/persona.ts`
- `src/agents/partner/agent.ts`
- `src/agents/admin/agent.ts`
- `src/agents/crm/agent.ts`
- `src/agents/crm/persona.ts`

Verify:

- Name which modes are read-only.
- Name which mode can send WhatsApp.
- Explain why web mode cannot currently call two tools in one request.
- Explain why CRM mode can execute multiple tool calls per model turn.

Small experiment:

```bash
npm test -- src/tests/web-agent.test.ts src/tests/partner-chatbot.test.ts src/tests/admin-chatbot.test.ts
```

## Day 3: Follow Storage

Read:

- `src/lib/db.ts`
- `src/model/Bot.ts`
- `src/model/KnowledgeSource.ts`
- `src/model/KnowledgeChunk.ts`
- `src/model/ChatSession.ts`
- `src/lib/gemini.ts`
- `src/lib/chatCache.ts`

Verify:

- Explain which chat history goes to MongoDB and which goes to Redis.
- Explain how a knowledge source becomes searchable chunks.
- Explain what happens when Redis is unavailable.

Small experiment:

```bash
npm test -- src/tests/chunk-text.test.ts src/tests/retrieve-relevant-chunks.test.ts
```

## Day 4: Follow Live GPS Data

Read:

- `src/lib/pgClient.ts`
- `src/lib/loanDb.ts`
- `src/lib/crmDb.ts`
- `src/lib/adminDb.ts`
- `src/lib/chatAuth.ts`

Verify:

- Find every place partner scope is resolved or enforced.
- Explain why admin queries do not filter by partner.
- Explain why `db/crm_assistant_schema.sql` is not enough for current Postgres helpers.

Small experiment:

```bash
npm test -- src/tests/loanDb.test.ts src/tests/crmDb.test.ts src/tests/adminDb.test.ts src/tests/chat-auth.test.ts
```

## Day 5: Follow External Services

Read:

- `src/lib/llm/router.ts`
- `src/lib/embeddings.ts`
- `src/lib/documentAnalyser.ts`
- `src/lib/gpsBridge.ts`
- `src/lib/whatsapp.ts`
- `src/lib/briefingGenerator.ts`

Verify:

- Explain default LLM provider order.
- Explain why `GEMINI_API_KEY` is still needed even if OpenRouter works.
- Explain WhatsApp block/stub/send paths.
- Explain what credentials are needed for morning briefings.

Small experiment:

```bash
npm test -- src/tests/llm-router.test.ts src/tests/analyse-document.test.ts src/tests/send-whatsapp-message.test.ts
```

## Day 6: Make One Tiny Safe Change

Pick one:

- Add a new starter prompt in `ChatClient`.
- Add a new alias in `loanTypes.ts`.
- Improve one fallback message in a persona.
- Add one assertion to an existing test.

Then run the smallest related test. If no test exists, add one small test.

## Questions You Should Be Able To Answer

- What is the difference between `/api/chat/web` and `/api/chat` with `botId`?
- Which code path uses `KnowledgeChunk`?
- Which code path uses `lending_products`?
- Which code path uses `banks` and `lender_doc_requirements`?
- What breaks if Redis is down?
- What breaks if MongoDB is down?
- What breaks if `DATABASE_URL` is missing?
- What happens if `GPS_JWT_PUBLIC_KEY` is missing?
- Which routes should be hardened before production multi-tenant use?
- Where would you add a new CRM write action, and where would you test it?

