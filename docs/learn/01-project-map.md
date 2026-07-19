# Project Map

## Active Request Path

| File | Responsibility |
| --- | --- |
| `src/app/layout.tsx` | Page metadata and root HTML layout |
| `src/app/page.tsx` | Renders the single chat workspace |
| `src/app/globals.css` | Theme tokens and global styles |
| `src/components/ChatWorkspace.tsx` | Chat UI, history, theme, and auth controls |
| `src/components/FormattedChatMessage.tsx` | Formats assistant response text |
| `src/lib/loanAppApi.ts` | Typed LoanApp API client and in-memory access token |
| `src/tests/chat-client.test.ts` | Checks the active client contract |

## Product Boundaries

This repository currently owns the browser UI only. The LoanApp backend owns:

- Google chat authentication and refresh cookies
- Assistant execution and loan knowledge
- Conversation and message persistence
- Anonymous or authenticated conversation ownership
- API validation and authorization

Legacy helpers, models, tests, dependencies, and empty route folders have been
removed; the source tree now contains only the thin-client request path.

## Terms

| Term | Meaning |
| --- | --- |
| LoanApp API | Backend selected by `NEXT_PUBLIC_LOANAPP_API_URL` |
| Session ID | Opaque UUID stored as `assistantSessionId` in `localStorage` |
| Conversation ID | Backend-issued ID for one persisted chat |
| Active conversation | ID stored as `assistantConversationId` in `localStorage` |
| Chat access token | Short-lived token kept only in module memory |
| Refresh cookie | Backend cookie sent with `credentials: "include"` |

## Routes Removed From The Active App

Do not follow old documentation or tests that refer to local `/api/chat/*`,
`/dashboard`, `/embed`, CRM, partner, admin, or knowledge routes. The current
frontend uses LoanApp endpoints directly.
