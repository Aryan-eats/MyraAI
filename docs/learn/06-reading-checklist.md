# Reading Checklist

## 1. Follow The Page

Read:

- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/components/ChatWorkspace.tsx`

Confirm that `/` is the only active product page and that the browser renders a
single public chat mode.

## 2. Follow The API Client

Read `src/lib/loanAppApi.ts` and answer:

- What is the default LoanApp URL?
- Which requests include the anonymous session ID?
- Where is the access token stored?
- Why is `credentials: "include"` set?
- How are `204` responses handled?

## 3. Follow Browser State

Find these keys in `ChatWorkspace.tsx` and `loanAppApi.ts`:

- `assistantSessionId`
- `assistantConversationId`
- `myra.theme`

Explain what clearing each key changes.

## 4. Read The Focused Test

Read and run:

```bash
npx vitest run src/tests/chat-client.test.ts
```

The test checks session ID reuse, cookie refresh, memory-only access tokens,
conversation URLs, Google login, and removal of the old multi-mode UI.

## 5. Trace One Live Message

With LoanApp running, send one message and inspect the browser network panel.
Confirm the `/assistant/message` body, response envelope, credentialed request,
and subsequent conversation-list refresh.

## Final Self-Test

You are onboarded when you can explain:

- What this repository owns versus what LoanApp owns.
- How guest and signed-in requests differ.
- Why a browser session ID is still sent after auth.
- Where to change the UI, API contract, and backend assistant behavior.
- Which single environment variable the frontend reads.
