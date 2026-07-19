# Data And Integrations

## Environment

The active frontend has one runtime setting:

```env
NEXT_PUBLIC_LOANAPP_API_URL=http://localhost:5000/api
```

The value must include LoanApp's `/api` prefix. Trailing slashes are removed by
the client. Because this variable is public, never put credentials in it.

## LoanApp Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/chat/refresh` | Exchange refresh cookie for chat user and access token |
| `GET` | `/auth/chat/google` | Start Google OAuth in the browser |
| `POST` | `/auth/chat/logout` | Clear backend chat auth |
| `POST` | `/assistant/message` | Send a message and create or continue a conversation |
| `GET` | `/assistant/conversations` | List conversations visible to the current owner |
| `GET` | `/assistant/conversations/:id/messages` | Load one conversation |
| `DELETE` | `/assistant/conversations/:id` | Delete one conversation |

All fetch requests use `credentials: "include"`. After a successful refresh,
requests also use `Authorization: Bearer <accessToken>`.

## Data Ownership

Conversation and message data is not stored by this Next.js app. The LoanApp
backend persists it in PostgreSQL and enforces owner access. The frontend keeps
only opaque IDs and theme preference in browser storage.

## Removed Local Integrations

MongoDB, Redis, PostgreSQL, LLM providers, ScaleKit, WhatsApp, and GPS bridge
configuration are not used by the active frontend request path. Configure those
services in LoanApp if its backend requires them.

## Cross-Origin Setup

When frontend and LoanApp run on different origins, LoanApp must allow the
frontend origin and credentialed requests. OAuth must return the browser to the
frontend origin configured by LoanApp.
