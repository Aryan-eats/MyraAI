# Reading Checklist

Use this as a practical onboarding plan. The goal is to understand the product,
then the code paths, then the failure modes.

## Day 1: Understand The Product

Read:

- `README.md`
- `docs/learn/README.md`
- `src/app/chat/page.tsx`
- `src/components/ChatClient.tsx`

You should be able to answer:

- Who uses `web`, `crm`, `partner`, and `admin` modes?
- Which modes require a GPS JWT?
- Which mode can perform CRM actions?
- Which mode is public?

Small check:

```bash
npm test -- src/tests/chat-client.test.ts
```

## Day 2: Follow The Public Loan Chatbot

Read:

- `src/app/api/chat/web/route.ts`
- `src/agents/web/agent.ts`
- `src/agents/web/persona.ts`
- `src/agents/web/tools/compareProducts.ts`
- `src/agents/web/tools/captureLead.ts`
- `src/agents/web/tools/checkEligibility.ts`

You should be able to answer:

- How does the chatbot decide which language to use?
- Which tool calculates EMI?
- Which tool captures a lead?
- What data source order does product comparison use?
- Why must the public chatbot avoid Aadhaar, PAN, bank account numbers, and OTPs?

Small check:

```bash
npm test -- src/tests/web-agent.test.ts src/tests/compare-products.test.ts src/tests/capture-lead.test.ts
```

## Day 3: Follow The CRM Assistant

Read:

- `src/app/api/chat/crm/route.ts`
- `src/agents/crm/agent.ts`
- `src/agents/crm/persona.ts`
- `src/agents/crm/tools/sendWhatsapp.ts`
- `src/agents/crm/tools/runSoftCheck.ts`
- `src/agents/crm/tools/analyseDocument.ts`
- `src/lib/gpsBridge.ts`
- `src/lib/whatsapp.ts`

You should be able to answer:

- How does partner authentication reach the agent?
- Which CRM tools have side effects?
- Where is WhatsApp consent checked?
- Where is document redaction handled?
- What happens if the model never returns a final text answer?

Small check:

```bash
npm test -- src/tests/crm-agent.test.ts src/tests/send-whatsapp-message.test.ts src/tests/analyse-document.test.ts
```

## Day 4: Follow Auth And Data Scope

Read:

- `src/lib/chatAuth.ts`
- `src/lib/crmDb.ts`
- `src/lib/adminDb.ts`
- `src/lib/loanDb.ts`
- `src/app/api/chat/partner/route.ts`
- `src/app/api/chat/admin/route.ts`

You should be able to answer:

- How is `/api/auth/me` normalized?
- Where is partner organization scope resolved?
- Why are admin queries not partner-scoped?
- What happens when `DATABASE_URL` is missing?

Small check:

```bash
npm test -- src/tests/chat-auth.test.ts src/tests/crmDb.test.ts src/tests/adminDb.test.ts src/tests/loanDb.test.ts
```

## Day 5: Follow Providers And Storage

Read:

- `src/lib/llm/router.ts`
- `src/lib/gemini.ts`
- `src/lib/db.ts`
- `src/lib/chatCache.ts`
- `src/lib/embeddings.ts`
- `src/lib/documentAnalyser.ts`

You should be able to answer:

- What is the default LLM provider order?
- Why can Gemini still be required when OpenRouter is configured?
- Which chat history uses Redis?
- Which embedded bot data uses MongoDB?
- What does the router log when providers fail?

Small check:

```bash
npm test -- src/tests/llm-router.test.ts src/tests/chat-rag.test.ts src/tests/retrieve-relevant-chunks.test.ts
```

## Day 6: Make One Tiny Safe Change

Pick one:

- Improve one fallback message in a persona.
- Add one loan-type alias in `src/lib/loanTypes.ts`.
- Add one assertion to an existing test.
- Add one CRM starter prompt in `src/components/ChatClient.tsx`.

Then run the smallest related test.

## Final Self-Test

Before calling yourself onboarded, explain these without opening the docs:

- Difference between `/api/chat/web` and `/api/chat` with `botId`.
- Difference between `crm` and `partner` modes.
- Where partner scope is enforced.
- Where WhatsApp can be stubbed or sent.
- Where product comparison gets data from.
- Which env vars are needed for a basic local run.
- Which files you would edit to add a new CRM action.
