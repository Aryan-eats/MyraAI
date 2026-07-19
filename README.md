# Myra AI Chat Frontend

Myra AI is a public loan and finance chat interface built with Next.js. This
repository contains only the browser UI; authentication, assistant execution,
conversation persistence, and authorization belong to the separate LoanApp API.

## What This Repository Owns

- Public guest and Google-authenticated chat UI
- Server-backed conversation history controls
- Anonymous browser session and active-conversation identifiers
- Light and dark themes
- Assistant message formatting
- A typed browser client for LoanApp

It does not contain a local chatbot backend, database, LLM integration, CRM,
admin dashboard, custom bot builder, embedded widget, or knowledge-ingestion
pipeline.

## Architecture

```text
Browser
  -> Next.js chat page
  -> src/lib/loanAppApi.ts
  -> LoanApp API
  -> assistant runtime and PostgreSQL persistence
```

LoanApp is the source of truth. If LoanApp is unavailable, this frontend reports
the request failure; it does not fall back to another assistant backend.

## Setup

Install dependencies:

```bash
npm install
```

Configure the LoanApp API URL in `.env.local`:

```env
NEXT_PUBLIC_LOANAPP_API_URL=http://localhost:5000/api
```

The `/api` prefix is required. When the variable is absent, the client uses the
same local URL by default.

Start development:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build |
| `npm test` | Run the focused Vitest suite |
| `npm run lint` | Run ESLint |
| `npx tsc --noEmit` | Type-check without emitting files |

On Windows PowerShell, use `npm.cmd` or `npx.cmd` if script execution policy
blocks `npm` or `npx`.

## LoanApp API Contract

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/chat/refresh` | Restore chat authentication |
| `GET` | `/auth/chat/google` | Start Google sign-in |
| `POST` | `/auth/chat/logout` | End the chat session |
| `POST` | `/assistant/message` | Create or continue a conversation |
| `GET` | `/assistant/conversations` | List owned conversations |
| `GET` | `/assistant/conversations/:id/messages` | Load conversation messages |
| `DELETE` | `/assistant/conversations/:id` | Delete a conversation |

Requests use `credentials: "include"`. After authentication refresh, the chat
access token is held in memory and sent as a bearer token; it is never written
to browser storage.

## Browser State

| Key | Purpose |
| --- | --- |
| `assistantSessionId` | Opaque anonymous session UUID |
| `assistantConversationId` | Last active conversation |
| `myra.theme` | Light or dark theme preference |

Conversation messages are stored by LoanApp, not in this frontend's
`localStorage`.

## Source Map

| Path | Responsibility |
| --- | --- |
| `src/app/page.tsx` | Single public chat page |
| `src/components/ChatWorkspace.tsx` | Chat, history, auth, and theme UI |
| `src/components/FormattedChatMessage.tsx` | Assistant response rendering |
| `src/lib/loanAppApi.ts` | LoanApp browser API client |
| `src/lib/chatFormatting.ts` | Chat text parser |
| `src/tests/chat-client.test.ts` | API, auth, history, and storage checks |
| `src/tests/chat-formatting.test.ts` | Message-formatting checks |

## Cross-Origin Requirements

When the frontend and LoanApp use different origins, LoanApp must allow the
frontend origin, credentialed requests, and the correct OAuth return URL. Do not
put secrets in `NEXT_PUBLIC_LOANAPP_API_URL`; every `NEXT_PUBLIC_*` value is
included in the browser bundle.

## Learn More

Start with [docs/learn/README.md](docs/learn/README.md) for architecture, chat
flows, integrations, development guidance, and the onboarding checklist.

## License

Private and proprietary.
