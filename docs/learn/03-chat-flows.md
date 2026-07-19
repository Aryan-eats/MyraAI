# Chat Flows

## Send A Message

```text
User submits text
  -> optimistically render the user message
  -> POST /assistant/message
  -> LoanApp returns conversationId, message, and actions
  -> render the assistant message
  -> refresh conversation history
```

Request body:

```json
{
  "message": "What documents do I need for a home loan?",
  "conversationId": "optional-existing-id",
  "sessionId": "browser-session-uuid"
}
```

The UI currently renders `message`. The returned `actions` field is typed but
not displayed.

## Conversation History

| Action | LoanApp request |
| --- | --- |
| List | `GET /assistant/conversations?sessionId=...` |
| Load | `GET /assistant/conversations/:id/messages?sessionId=...` |
| Delete | `DELETE /assistant/conversations/:id?sessionId=...` |

Starting a new conversation clears only the active conversation ID and visible
messages. It does not delete stored history.

## Anonymous Identity

`getAssistantSessionId()` reuses `localStorage.assistantSessionId` or creates a
UUID with `crypto.randomUUID()`. The client sends it on assistant and history
requests so the backend can resolve guest ownership.

## Google Sign-In

```text
Click "Sign in with Google"
  -> browser navigates to /auth/chat/google on LoanApp
  -> LoanApp completes OAuth and sets its refresh credential
  -> frontend reload attempts POST /auth/chat/refresh
  -> returned access token stays in memory
```

Sign-out calls `POST /auth/chat/logout`, clears the in-memory token even if the
request fails, resets the visible conversation, and reloads history as a guest.

## Errors

LoanApp errors are appended as assistant messages. Initial auth or history
errors degrade to guest mode with an empty history list.
