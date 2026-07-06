# Chat Flows

The project has four main assistant APIs plus one older embedded bot route.

## UI Routing

`src/app/chat/page.tsx` accepts:

```text
/chat?mode=web
/chat?mode=crm
/chat?mode=partner
/chat?mode=admin
```

`src/components/ChatClient.tsx` maps each mode to an endpoint:

| Mode | Endpoint | Auth |
| --- | --- | --- |
| `web` | `/api/chat/web` | None |
| `crm` | `/api/chat/crm` | GPS JWT |
| `partner` | `/api/chat/partner` | GPS JWT |
| `admin` | `/api/chat/admin` | GPS JWT |

## Public Loan Chatbot

Files:

- `src/app/api/chat/web/route.ts`
- `src/agents/web/agent.ts`
- `src/agents/web/persona.ts`
- `src/agents/web/tools/*`

Request shape:

```json
{
  "message": "I need a home loan",
  "sessionId": "optional-session-id",
  "conversation": []
}
```

Flow:

```text
POST /api/chat/web
  -> load Redis history
  -> use browser conversation only if Redis has no history
  -> runWebAgent()
  -> execute first requested tool, if any
  -> ask model for final answer
  -> save history
  -> return answer, sessionId, toolsUsed, leadCaptured
```

Tools:

| Tool | Purpose |
| --- | --- |
| `search_knowledge` | Find product/rate/process answers |
| `compare_products` | Compare lenders and offers |
| `get_documents` | Return document checklist |
| `calculate_emi` | Calculate EMI |
| `check_eligibility` | Estimate FOIR-based eligibility |
| `capture_lead` | Create or forward a borrower lead |

Important behavior:

- Current-message language wins: Hindi, Hinglish, or English.
- It should not ask for Aadhaar, PAN, bank account numbers, or OTPs.
- `compare_products` tries GPS backend offers first, then PostgreSQL, then
  MongoDB lending fallback data.
- `capture_lead` tries GPS backend lead creation first when enough fields exist.

## CRM Assistant

Files:

- `src/app/api/chat/crm/route.ts`
- `src/agents/crm/agent.ts`
- `src/agents/crm/persona.ts`
- `src/agents/crm/tools/*`

Flow:

```text
POST /api/chat/crm
  -> require partner auth
  -> load Redis history
  -> runCrmAgent()
  -> model can call tools for up to 8 iterations
  -> save history
  -> return answer, toolsUsed, iterations
```

CRM tools:

| Tool | Side effect |
| --- | --- |
| `query_pipeline` | No, reads scoped pipeline data |
| `get_commissions` | No, reads scoped commission data |
| `send_whatsapp` | Yes, sends or stubs WhatsApp and logs status |
| `analyse_document` | Yes, analyzes and logs redacted document output |
| `run_soft_check` | Yes, evaluates lead and appends note |
| `generate_briefing` | Yes, stores briefing |
| `add_partner_note` | Yes, writes partner note |

CRM is the main action-capable assistant. Keep validation, scope checks, and
side-effect rules in TypeScript, not only in the persona.

## Partner Assistant

Files:

- `src/app/api/chat/partner/route.ts`
- `src/agents/partner/agent.ts`
- `src/agents/partner/persona.ts`
- `src/agents/partner/tools/*`

This is read-only. It answers partner questions about:

- Pipeline overview
- Lead status
- Missing documents
- Commission overview
- Stalled leads

It should refuse actions like sending WhatsApp or changing lead status.

## Admin Assistant

Files:

- `src/app/api/chat/admin/route.ts`
- `src/agents/admin/agent.ts`
- `src/agents/admin/persona.ts`
- `src/lib/adminDb.ts`

This is read-only platform analytics. It can answer:

- Platform overview
- Partner performance
- Bank statistics
- Leads by status

Admin visibility is wider than partner visibility, so auth must stay in the
route and data helpers.

## Embedded Bot Route

Files:

- `public/widget.js`
- `src/app/embed/page.tsx`
- `src/components/Chat/EmbedChat.tsx`
- `src/app/api/chat/route.ts`
- `src/lib/retrieval.ts`

Flow:

```text
External site script
  -> iframe /embed?botId=...
  -> POST /api/chat { botId, message, sessionId }
  -> load Bot and ChatSession from MongoDB
  -> retrieve KnowledgeChunk rows
  -> generate answer from retrieved bot knowledge
  -> append ChatSession messages
```

This path is separate from `/api/chat/web`. It is for custom embedded bots, not
the first-party loan chatbot.

## Debugging A Bad Answer

Use this order:

1. Confirm which endpoint was called.
2. Confirm auth resolved the expected user and partner scope.
3. Confirm Redis history is not carrying stale context.
4. Confirm the model requested the expected tool.
5. Confirm the tool returned the expected data.
6. Confirm the persona tells the model how to use that data.
7. Add the smallest test that would catch the bug next time.
