# Chat Flows

This app has five meaningful chat paths:

1. `/api/chat/web`: public GPS web lending advisor.
2. `/api/chat/partner`: authenticated read-only partner chatbot.
3. `/api/chat/admin`: authenticated read-only admin chatbot.
4. `/api/chat/crm`: authenticated action-capable partner CRM copilot.
5. `/api/chat`: embedded bot RAG flow, plus a legacy non-`botId` flow.

## UI Routing

`src/app/chat/page.tsx` accepts:

```text
/chat?mode=web
/chat?mode=crm
/chat?mode=partner
/chat?mode=admin
```

It renders `src/components/ChatClient.tsx`, whose `MODE_CONFIG` maps modes to
endpoints:

| Mode | Endpoint | Token input |
| --- | --- | --- |
| `web` | `/api/chat/web` | No |
| `crm` | `/api/chat/crm` | Yes |
| `partner` | `/api/chat/partner` | Yes |
| `admin` | `/api/chat/admin` | Yes |

For token modes, the UI lets a developer paste a GPS JWT. That token is sent as
`Authorization: Bearer <token>`.

## Web Lending Advisor

Files:

- `src/app/api/chat/web/route.ts`
- `src/agents/web/agent.ts`
- `src/agents/web/persona.ts`
- `src/agents/web/tools/*`

Flow:

```text
POST /api/chat/web { message, sessionId?, endSession? }
  -> reject if no configured LLM provider
  -> sessionId from body, x-session-id, or random UUID
  -> load Redis history
  -> runWebAgent(message, history)
  -> save user/model turns to Redis
  -> optionally summarize and close
  -> return { sessionId, answer, toolsUsed, leadCaptured }
```

Tools:

| Tool name | Implementation | Purpose |
| --- | --- | --- |
| `search_knowledge` | `searchKnowledge.ts` | Bank/product rates, fees, TAT, supported loan types |
| `compare_products` | `compareProducts.ts` | Compare banks for one loan type |
| `get_documents` | `getDocuments.ts` | Official bank and loan document checklist |
| `calculate_emi` | `calculateEmi.ts` | Pure EMI math |
| `check_eligibility` | `checkEligibility.ts` | FOIR-based indicative eligibility |
| `capture_lead` | `captureLead.ts` | Send callback lead to webhook or local stub result |

Important behavior:

- Web mode is a two-pass, single-tool flow.
- It executes only the first tool call returned by the first model response.
- It catches model/tool failures and returns a helpful fallback.
- It should never ask for Aadhaar, PAN, bank account numbers, or OTPs.

Data source:

- If `DATABASE_URL` is set, product and document tools use PostgreSQL.
- If PostgreSQL is absent, product search/comparison falls back to MongoDB
  `lending_products`.

## Partner Chatbot

Files:

- `src/app/api/chat/partner/route.ts`
- `src/agents/partner/agent.ts`
- `src/agents/partner/persona.ts`
- `src/agents/partner/tools/*`

Flow:

```text
POST /api/chat/partner { message, sessionId? }
  -> requirePartnerAuth(req)
  -> reject if no configured LLM provider
  -> load Redis history
  -> runPartnerChatbot(message, history, partner)
  -> save user/model turns to Redis
  -> return { sessionId, answer, toolsUsed }
```

Tools:

| Tool name | Purpose |
| --- | --- |
| `get_pipeline_overview` | Partner pipeline counts, status breakdown, commissions, disbursal total |
| `get_lead_status` | Resolve lead by name or list by status |
| `get_missing_docs_list` | Leads in document trouble |
| `get_commission_overview` | Current-month pending/processing/paid commission totals |
| `get_stalled_leads` | Non-terminal leads with no recent activity |

Important behavior:

- Read-only by design.
- Persona explicitly refuses actions such as sending WhatsApp or changing status.
- Tool errors are caught and returned to the model as `{ error }`.
- If the loop fails, it returns a fallback instead of throwing.

## Admin Chatbot

Files:

- `src/app/api/chat/admin/route.ts`
- `src/agents/admin/agent.ts`
- `src/agents/admin/persona.ts`
- `src/agents/admin/tools/*`
- `src/lib/adminDb.ts`

Flow:

```text
POST /api/chat/admin { message, sessionId? }
  -> requireAdminAuth(req)
  -> reject if no configured LLM provider
  -> load Redis history
  -> runAdminChatbot(message, history, admin)
  -> save user/model turns to Redis
  -> return { sessionId, answer, toolsUsed }
```

Tools:

| Tool name | Purpose |
| --- | --- |
| `get_platform_overview` | Total leads, active leads, disbursals, total disbursed, active partners |
| `get_partner_performance` | Partner leaderboard or filtered partner stats |
| `get_bank_stats` | Bank-wise lead volume and approval rate |
| `get_leads_by_status` | Platform leads by status with partner names |

Important behavior:

- Platform-wide visibility.
- Read-only by persona and by exposed tools.
- Requires user role in `super_admin`, `admin`, `manager`, or `agent` when PostgreSQL auth is active.

## CRM Copilot

Files:

- `src/app/api/chat/crm/route.ts`
- `src/agents/crm/agent.ts`
- `src/agents/crm/persona.ts`
- `src/agents/crm/tools/*`
- `src/lib/gpsBridge.ts`
- `src/lib/whatsapp.ts`
- `src/lib/softCheckEngine.ts`
- `src/lib/documentAnalyser.ts`

Flow:

```text
POST /api/chat/crm { message, sessionId?, endSession? }
  -> requirePartnerAuth(req)
  -> load Redis history
  -> runCrmAgent(message, history, auth)
  -> save user/model turns to Redis
  -> optionally summarize and close
  -> return { sessionId, answer, toolsUsed, iterations }
```

Tools:

| Tool name | Side effects |
| --- | --- |
| `send_whatsapp` | Yes, may send or stub WhatsApp and append partner note |
| `analyse_document` | Yes, analyzes file and logs analysis through GPS bridge |
| `run_soft_check` | Yes, fetches lead, evaluates, appends partner note |
| `generate_briefing` | Yes, generates and stores briefing |
| `add_partner_note` | Yes, appends note through GPS bridge |
| `query_pipeline` | Read path, may use cache |
| `get_commissions` | Read path, may use cache |

Important behavior:

- Multi-tool loop, up to 8 iterations.
- Executes all tool calls from one model response in parallel.
- Throws `AgentLoopError` if no terminal text response arrives.
- This is the only current mode intended to perform CRM actions.

## Embedded Bot RAG

Files:

- `public/widget.js`
- `src/app/embed/page.tsx`
- `src/components/Chat/EmbedChat.tsx`
- `src/app/api/bots/[botId]/public/route.ts`
- `src/app/api/chat/route.ts`
- `src/lib/retrieval.ts`

Flow:

```text
script tag with data-bot-id
  -> public/widget.js injects iframe /embed?botId=...
  -> EmbedChat fetches /api/bots/<botId>/public
  -> user message POST /api/chat { botId, message, sessionId }
  -> runBotChatFlow()
  -> load active Bot
  -> create/load ChatSession in Mongo
  -> retrieveRelevantChunks(botId, message)
  -> generateText with bot prompt + knowledge + recent history
  -> append messages to ChatSession
  -> return { reply, answer, sessionId }
```

This path is stricter than `/api/chat/web`: it tells the model to answer only
from retrieved bot knowledge and use the bot fallback if the answer is missing.

## Legacy `/api/chat` Without `botId`

The same route has another path when no `botId` is supplied.

Flow:

```text
POST /api/chat { message, ownerId?, conversation? }
  -> CORS check from CHAT_ALLOWED_ORIGINS
  -> getChatUser()
  -> memory rate limit
  -> cache check
  -> rule classifier or model classifier
  -> one of:
       - FAQ response from knowledge_documents/settings
       - GPS tool flow
       - escalation
```

This flow is older than the dedicated `/api/chat/web|crm|partner|admin` routes.
Read it if you are changing the embed bot path or legacy authenticated chat.

## Adding Or Changing A Tool

For a role-specific agent:

1. Add or edit the concrete tool in `src/agents/<mode>/tools`.
2. Add the tool declaration in `get<Mode>ToolDeclarations()` inside `agent.ts`.
3. Add dispatch logic in `execute<Mode>Tool()` or switch equivalent.
4. Update the persona if the model needs a new boundary or usage rule.
5. Add a focused test in `src/tests`.

Do not put authorization only in the prompt. Enforce it in the tool or route.

## Debugging Bad Answers

Use this order:

1. Confirm which endpoint the UI called.
2. Confirm auth resolved the expected partner/admin/user.
3. Confirm Redis history is not carrying stale context.
4. Confirm the model requested the expected tool.
5. Confirm the tool returned the data you expected.
6. Confirm the persona tells the model how to use that data.
7. Add or update the smallest test that would have caught the bad behavior.

