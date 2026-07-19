# Architecture

## Runtime Shape

```text
Next.js browser UI
  |
  | fetch with credentials: include
  v
LoanApp API (/api)
  |-- chat auth
  |-- assistant messages
  `-- conversation persistence
```

`src/lib/loanAppApi.ts` is the only active integration boundary. It normalizes
the configured base URL, adds JSON headers when needed, includes cookies, adds
an in-memory bearer token after refresh, and unwraps LoanApp's response shape.

## API Response Contract

Successful JSON responses use:

```json
{
  "success": true,
  "data": {}
}
```

Failed responses use `message` for the user-facing error. A successful delete
may return HTTP `204` without JSON.

## Browser State

| State | Storage | Lifetime |
| --- | --- | --- |
| Anonymous session ID | `localStorage` | Browser profile |
| Active conversation ID | `localStorage` | Browser profile |
| Theme | `localStorage` | Browser profile |
| Chat access token | Module variable | Current page runtime |
| Refresh credential | Cookie managed by LoanApp | Backend policy |

The access token is deliberately not written to `localStorage`.

## Rendering

`src/app/page.tsx` has no server-side session lookup or redirect. It renders the
client workspace immediately. On mount, the workspace:

1. Restores the theme.
2. Attempts a chat-auth refresh.
3. Lists available conversations.
4. Reopens the last active conversation when it still exists.

Authentication failure does not block guest chat.
