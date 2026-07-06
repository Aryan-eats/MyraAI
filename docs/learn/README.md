# Learn Myra AI

This folder explains the project for someone joining from outside the team.
Start here before reading source code.

## Product In One Paragraph

Myra AI is a lending assistant platform. It has a public loan chatbot for
borrowers and authenticated assistants for CRM users. The public chatbot answers
loan questions, compares products, estimates eligibility, and captures leads.
The CRM assistant helps partners and operations users check pipeline status,
review documents, run soft checks, send WhatsApp follow-ups, and generate daily
briefings.

## Who Uses It

| User | What they do | Main route |
| --- | --- | --- |
| Borrower | Ask about loans, documents, rates, EMI, eligibility | `/chat?mode=web` |
| Partner CRM user | Follow up leads, check pipeline, run CRM actions | `/chat?mode=crm` |
| Partner viewer | Read partner pipeline and commissions | `/chat?mode=partner` |
| Admin or ops user | Read platform-wide metrics | `/chat?mode=admin` |
| Bot owner | Manage older embeddable bots and knowledge | `/dashboard` |

## Read In This Order

1. [01-project-map.md](01-project-map.md): product map, repo layout, glossary.
2. [02-architecture.md](02-architecture.md): how requests move through the app.
3. [03-chat-flows.md](03-chat-flows.md): every assistant from UI to response.
4. [04-data-and-integrations.md](04-data-and-integrations.md): databases, APIs, LLMs, feature flags.
5. [05-development-playbook.md](05-development-playbook.md): setup, tests, common changes.
6. [06-reading-checklist.md](06-reading-checklist.md): onboarding exercises.

## Fast Mental Model

```text
Browser
  -> Next.js page or API route in src/app
  -> agent loop in src/agents/<mode>
  -> typed tools in src/agents/<mode>/tools
  -> shared adapters in src/lib
  -> MongoDB, Redis, PostgreSQL, GPS backend, WhatsApp, or LLM provider
```

Prompts decide what the assistant should try. TypeScript code decides what is
allowed, which data can be accessed, and which external service is called.

## Main Code Areas

| Area | Files |
| --- | --- |
| Chat page | `src/app/chat/page.tsx`, `src/components/ChatClient.tsx` |
| Public loan chatbot | `src/app/api/chat/web/route.ts`, `src/agents/web/*` |
| CRM assistant | `src/app/api/chat/crm/route.ts`, `src/agents/crm/*` |
| Partner assistant | `src/app/api/chat/partner/route.ts`, `src/agents/partner/*` |
| Admin assistant | `src/app/api/chat/admin/route.ts`, `src/agents/admin/*` |
| LLM fallback | `src/lib/llm/router.ts`, `src/lib/gemini.ts` |
| Auth | `src/lib/chatAuth.ts`, `src/lib/getSession.ts`, `src/proxy.ts` |
| Data access | `src/lib/loanDb.ts`, `src/lib/crmDb.ts`, `src/lib/adminDb.ts` |
| CRM actions | `src/lib/gpsBridge.ts`, `src/lib/whatsapp.ts`, `src/lib/softCheckEngine.ts`, `src/lib/documentAnalyser.ts` |

## Terms Used In This Project

| Term | Meaning |
| --- | --- |
| FOIR | Fixed obligation to income ratio, used for indicative affordability checks |
| Lead | A borrower enquiry or loan opportunity |
| Partner | A DSA/channel partner using the CRM |
| Soft check | Rule-based eligibility review before formal underwriting |
| Briefing | Daily CRM summary for follow-ups and stalled leads |
| Tool | A TypeScript function the LLM can ask the agent to run |
| GPS backend | External lending/CRM backend configured by `GPS_INDIA_API_URL` |

## Current Caveat

The repo still contains an older embeddable bot product path (`public/widget.js`,
`/embed`, `/api/chat` with `botId`). It is documented where relevant, but the
primary product explained here is the loan chatbot and CRM assistant.
