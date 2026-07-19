# Development Playbook

## Install And Run

```bash
npm install
npm run dev
```

The frontend runs at `http://localhost:3000` and expects LoanApp at
`http://localhost:5000/api` unless `NEXT_PUBLIC_LOANAPP_API_URL` overrides it.

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

## Smallest Useful Checks

For API-client or chat state changes:

```bash
npx vitest run src/tests/chat-client.test.ts
```

For page, styles, imports, or build configuration:

```bash
npm run build
```

## Common Changes

### Change the LoanApp request contract

Edit `src/lib/loanAppApi.ts`, then update the focused client test. Keep base URL,
credentials, auth header, envelope handling, and URL encoding centralized in
that file.

### Change chat behavior or layout

Edit `src/components/ChatWorkspace.tsx`. It owns the visible messages, history,
auth controls, theme, optimistic send state, and active conversation.

### Change assistant response formatting

Edit `src/components/FormattedChatMessage.tsx`.

### Change backend assistant behavior

Do it in LoanApp. This frontend does not contain the active prompt, tools,
retrieval, persistence, or authorization logic.

## Manual Smoke Check

With both apps running:

1. Send a guest message and reload the page.
2. Open and delete a conversation from history.
3. Start a new conversation.
4. Complete Google sign-in and sign out.
5. Confirm no access token appears in `localStorage`.
6. Check the mobile history drawer and light/dark theme.

## Common Failures

| Symptom | Check |
| --- | --- |
| Every request fails | Base URL includes the correct `/api` prefix |
| Browser reports CORS | LoanApp allows the frontend origin and credentials |
| Google login loops | LoanApp OAuth callback and frontend return URL |
| History disappears | `assistantSessionId`, auth refresh, and backend owner resolution |
| `401` after page load | Refresh cookie policy and `/auth/chat/refresh` response |
