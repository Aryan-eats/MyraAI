# Learn Myra AI

This folder documents the current Myra AI frontend. Start here before reading
the source.

## Product In One Paragraph

Myra AI is a public loan and finance chat interface. The Next.js app renders the
chat experience and delegates authentication, conversation storage, and
assistant responses to the separate LoanApp API. Guests receive a browser-local
anonymous session ID; users can optionally sign in with Google.

## Current Surface

| User | What they can do | Route |
| --- | --- | --- |
| Guest | Chat and manage browser-owned conversation history | `/` |
| Signed-in user | Chat with a Google-backed LoanApp identity | `/` |

There are no local CRM, partner, admin, dashboard, embedded-widget, knowledge
management, or chat API routes in the active application.

## Read In This Order

1. [01-project-map.md](01-project-map.md): active files and terminology.
2. [02-architecture.md](02-architecture.md): browser-to-LoanApp request flow.
3. [03-chat-flows.md](03-chat-flows.md): chat, history, and authentication flows.
4. [04-data-and-integrations.md](04-data-and-integrations.md): runtime state and API contract.
5. [05-development-playbook.md](05-development-playbook.md): setup and common changes.
6. [06-reading-checklist.md](06-reading-checklist.md): a short onboarding exercise.

## Fast Mental Model

```text
Browser
  -> src/app/page.tsx
  -> src/components/ChatWorkspace.tsx
  -> src/lib/loanAppApi.ts
  -> LoanApp API
  -> PostgreSQL / assistant runtime
```

The frontend does not call an LLM or database directly.

## Only Required Configuration

```env
NEXT_PUBLIC_LOANAPP_API_URL=http://localhost:5000/api
```

The client uses that URL for every request and falls back to the same local URL
when the variable is absent.
