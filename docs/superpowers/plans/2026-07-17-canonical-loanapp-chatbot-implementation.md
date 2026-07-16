# Canonical LoanApp Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LoanApp the only chatbot backend, add isolated Google-authenticated chat users with persistent PostgreSQL history, add safe database-first/web-fallback loan guidance, and reduce `/agent/agent` to a separately hosted public chat UI.

**Architecture:** LoanApp keeps its existing Express/Prisma assistant and CRM scopes. A separate `ChatUser` principal and refresh-session table authenticate only `/api/auth/chat` and public assistant routes; conversation ownership selects exactly one of `sessionId`, `chatUserId`, or LoanApp `userId`. The Next.js repository becomes a browser-only client of LoanApp and stores only opaque session/conversation IDs locally.

**Tech Stack:** PostgreSQL, Prisma 7, Express 5, JSON Web Tokens, Google OAuth 2.0/OIDC with PKCE, Firecrawl REST API, Gemini, React 19, Next.js 16, Vitest.

---

Repository aliases used below:

- `AGENT_ROOT`: `C:\Users\risha\OneDrive\Desktop\agent\agent`
- `LOANAPP_ROOT`: `C:\Users\risha\OneDrive\Desktop\loan-app\.worktrees\chat-bot`

### Task 1: Add isolated chat-user persistence

**Files:**
- Modify: `LOANAPP_ROOT/backend/prisma/schema.prisma`
- Create: `LOANAPP_ROOT/backend/prisma/migrations/20260717000000_add_chat_users/migration.sql`
- Modify: `LOANAPP_ROOT/backend/src/tests/assistantSchema.test.ts`

- [ ] **Step 1: Write the failing schema assertions**

Add assertions that the schema contains `ChatUser`, `ChatAuthSession`, the mapped tables `chat_users` and `chat_auth_sessions`, and `AssistantConversation.chatUserId`. Assert the migration creates both tables, their unique provider identity/email constraints, the refresh-token hash, the foreign key, and the `assistant_conversations.chat_user_id` index.

- [ ] **Step 2: Run the focused schema test and verify failure**

Run: `npm.cmd test -- --run src/tests/assistantSchema.test.ts` from `LOANAPP_ROOT/backend`.

Expected: FAIL because `ChatUser` and `chat_user_id` do not exist.

- [ ] **Step 3: Add the minimum Prisma models and SQL migration**

Add `ChatUser` with UUID ID, unique email, Google provider identity, active/verified flags, login timestamps, `sessions`, and `assistantConversations`. Add `ChatAuthSession` with UUID ID, `chatUserId`, `refreshTokenHash`, expiry/revocation timestamps, and cascade deletion. Add nullable `chatUserId` and relation/index to `AssistantConversation`; retain every existing field and index.

- [ ] **Step 4: Generate Prisma and rerun the schema test**

Run: `npx.cmd prisma generate` and then `npm.cmd test -- --run src/tests/assistantSchema.test.ts` from `LOANAPP_ROOT/backend`.

Expected: Prisma generation succeeds and the focused test passes.

- [ ] **Step 5: Commit only Task 1 files**

```powershell
git add backend/prisma/schema.prisma backend/prisma/migrations/20260717000000_add_chat_users/migration.sql backend/src/tests/assistantSchema.test.ts
git commit -m "feat: add isolated chatbot users"
```

### Task 2: Add chat-only OAuth and sessions

**Files:**
- Modify: `LOANAPP_ROOT/backend/src/modules/auth/oauth.service.ts`
- Create: `LOANAPP_ROOT/backend/src/modules/auth/chatAuth.service.ts`
- Create: `LOANAPP_ROOT/backend/src/modules/auth/chatAuth.controller.ts`
- Create: `LOANAPP_ROOT/backend/src/modules/auth/chatAuth.middleware.ts`
- Modify: `LOANAPP_ROOT/backend/src/modules/auth/auth.routes.ts`
- Modify: `LOANAPP_ROOT/backend/src/shared/config/env.ts`
- Modify: `LOANAPP_ROOT/backend/.env.example`
- Modify: `LOANAPP_ROOT/.env.example`
- Create: `LOANAPP_ROOT/backend/src/tests/chatAuth.test.ts`
- Modify: `LOANAPP_ROOT/backend/src/tests/authRoutes.test.ts`

- [ ] **Step 1: Write failing chat-auth tests**

Cover these concrete cases:

```ts
it('creates a chat user without creating a LoanApp user')
it('returns the same chat user on repeat Google login')
it('rejects an inactive chat user')
it('uses chat-specific access and refresh secrets and audience')
it('rotates only the matching hashed chat refresh session')
it('revokes the chat session and clears the chat cookie on logout')
it('mounts Google start, callback, refresh, me, and logout under /chat')
```

Mock `prisma.chatUser` and `prisma.chatAuthSession`; assert `prisma.user.create` is never invoked.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm.cmd test -- --run src/tests/chatAuth.test.ts src/tests/authRoutes.test.ts` from `LOANAPP_ROOT/backend`.

Expected: FAIL because chat-auth exports and routes do not exist.

- [ ] **Step 3: Make the existing Google token exchange accept an explicit redirect URI**

Change `exchangeGoogleCodeForIdToken(code, verifier)` to `exchangeGoogleCodeForIdToken(code, verifier, redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI)`. Validate the chosen URI and use it in the token request. Existing partner callers remain source-compatible.

- [ ] **Step 4: Implement the chat session service**

Use existing `jsonwebtoken`, `crypto`, `createOAuthState`, `createPkceVerifier`, `buildGoogleAuthorizationUrl`, and verified Google identity parsing. Store Google identity directly on `chat_users`. Sign access tokens with `CHAT_JWT_SECRET`, audience `loanapp-chat`, and `principal: 'chat'`; sign refresh tokens with `CHAT_REFRESH_JWT_SECRET`, audience `loanapp-chat-refresh`, `principal: 'chat'`, and `jti = chat_auth_sessions.id`. Hash refresh tokens with SHA-256, rotate the stored hash on refresh, and reject revoked/expired/disabled sessions.

- [ ] **Step 5: Implement chat controllers and middleware**

Expose:

```text
GET  /api/auth/chat/google
GET  /api/auth/chat/google/callback
POST /api/auth/chat/refresh
GET  /api/auth/chat/me
POST /api/auth/chat/logout
```

Use cookie names `chat_oauth_state`, `chat_oauth_pkce_verifier`, and `chat_refresh_token`; use `httpOnly`, `secure` in production, `sameSite: strict`, and path `/api/auth/chat`. OAuth callback redirects only to `CHAT_FRONTEND_URL`; the UI obtains its in-memory access token through refresh. Add `optionalChatAuth` and `protectChat` that populate `req.chatUser` and never populate `req.user`.

- [ ] **Step 6: Add exact environment placeholders**

Add `CHAT_FRONTEND_URL`, `CHAT_JWT_SECRET`, `CHAT_REFRESH_JWT_SECRET`, and `GOOGLE_CHAT_OAUTH_REDIRECT_URI`. Do not add a new auth provider or dependency.

- [ ] **Step 7: Run focused auth tests and typecheck**

Run: `npm.cmd test -- --run src/tests/chatAuth.test.ts src/tests/authRoutes.test.ts` and `npx.cmd tsc --noEmit --project tsconfig.json` from `LOANAPP_ROOT/backend`.

Expected: tests and typecheck pass.

- [ ] **Step 8: Commit Task 2 files**

```powershell
git add backend/src/modules/auth backend/src/shared/config/env.ts backend/.env.example .env.example backend/src/tests/chatAuth.test.ts backend/src/tests/authRoutes.test.ts
git commit -m "feat: add chatbot Google authentication"
```

### Task 3: Persist and isolate complete conversation history

**Files:**
- Modify: `LOANAPP_ROOT/backend/src/modules/assistant/assistant.types.ts`
- Modify: `LOANAPP_ROOT/backend/src/modules/assistant/assistant.routes.ts`
- Modify: `LOANAPP_ROOT/backend/src/modules/assistant/assistant.controller.ts`
- Modify: `LOANAPP_ROOT/backend/src/modules/assistant/assistant.service.ts`
- Modify: `LOANAPP_ROOT/backend/src/tests/assistantRoutes.test.ts`
- Create: `LOANAPP_ROOT/backend/src/tests/assistantPersistence.test.ts`

- [ ] **Step 1: Write failing ownership/history tests**

Test anonymous ownership by `sessionId`, authenticated standalone ownership by `chatUserId`, CRM ownership by LoanApp `userId`, and partner scope plus organization context. Verify one principal cannot read, continue, list, or delete another principal's conversation. Verify a successful turn stores both messages and explicitly updates the parent conversation timestamp.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm.cmd test -- --run src/tests/assistantRoutes.test.ts src/tests/assistantPersistence.test.ts` from `LOANAPP_ROOT/backend`.

Expected: FAIL because chat principals, list/delete routes, and explicit timestamp updates are absent.

- [ ] **Step 3: Add one shared ownership filter**

Extend `AssistantContext` with `chatUserId?: string`. Build one internal `conversationOwnerWhere(ctx)` used by message, history, list, and delete operations:

```ts
if (ctx.chatUserId) return { scope: ctx.scope, chatUserId: ctx.chatUserId };
if (ctx.scope === 'public') return { scope: ctx.scope, sessionId: ctx.sessionId, chatUserId: null };
return { scope: ctx.scope, userId: ctx.userId };
```

Do not change existing LoanApp role resolution or partner organization enforcement.

- [ ] **Step 4: Add history management routes**

Add:

```text
GET    /api/assistant/conversations
GET    /api/assistant/conversations/:id/messages
DELETE /api/assistant/conversations/:id
POST   /api/assistant/message
```

Anonymous requests require a valid UUID `sessionId`; authenticated chat users do not. Return only owned conversations ordered by `updatedAt DESC`. Deletion relies on the existing message cascade.

- [ ] **Step 5: Update the conversation timestamp after every completed turn**

After the assistant message insert, call `assistantConversation.update({ data: { updatedAt: new Date() } })`. Keep message metadata and all existing audit events.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npm.cmd test -- --run src/tests/assistantRoutes.test.ts src/tests/assistantPersistence.test.ts` and `npx.cmd tsc --noEmit --project tsconfig.json` from `LOANAPP_ROOT/backend`.

Expected: all pass.

- [ ] **Step 7: Commit Task 3 files**

```powershell
git add backend/src/modules/assistant backend/src/tests/assistantRoutes.test.ts backend/src/tests/assistantPersistence.test.ts
git commit -m "feat: persist chatbot conversation history"
```

### Task 4: Add database-first safe web fallback and complete public tools

**Files:**
- Create: `LOANAPP_ROOT/backend/src/modules/assistant/assistant.web.ts`
- Modify: `LOANAPP_ROOT/backend/src/modules/assistant/assistant.finance.ts`
- Modify: `LOANAPP_ROOT/backend/src/modules/assistant/assistant.tools.ts`
- Modify: `LOANAPP_ROOT/backend/src/modules/assistant/assistant.runtime.ts`
- Modify: `LOANAPP_ROOT/backend/src/modules/assistant/assistant.service.ts`
- Modify: `LOANAPP_ROOT/backend/.env.example`
- Create: `LOANAPP_ROOT/backend/src/tests/assistantWebSearch.test.ts`
- Modify: `LOANAPP_ROOT/backend/src/tests/assistantTools.test.ts`
- Modify: `LOANAPP_ROOT/backend/src/tests/assistantAgent.test.ts`

- [ ] **Step 1: Write failing policy and tool tests**

Cover:

```ts
it('returns configured PostgreSQL knowledge without calling Firecrawl')
it('uses Firecrawl only when configured knowledge has no useful result')
it('rejects unrelated general questions')
it('blocks internal CRM questions and PII before Firecrawl')
it('returns sources for usable web results')
it('does not fabricate an answer when Firecrawl fails')
it('forces the Web search label and administrator confirmation into the saved answer')
it('calculates indicative FOIR bands')
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm.cmd test -- --run src/tests/assistantWebSearch.test.ts src/tests/assistantTools.test.ts src/tests/assistantAgent.test.ts` from `LOANAPP_ROOT/backend`.

- [ ] **Step 3: Add the minimum Firecrawl adapter and guards**

Call `https://api.firecrawl.dev/v2/search` with the installed native `fetch`, `FIRECRAWL_API_KEY`, a five-result limit, and a bounded timeout. Before the call, require a loans/banking/finance/CRM-practice topic and reject email, phone, PAN, Aadhaar, account-like numbers, UUIDs, and internal profile/lead/customer wording. Return a structured result with `source: 'database' | 'web_search' | 'blocked' | 'unavailable'` and source URLs.

- [ ] **Step 4: Make `searchKnowledgeTool` database-first**

Tokenize the bounded query, search active verified `ChatbotKnowledgeSource` rows first, and call Firecrawl only when no useful rows exist. Preserve existing lender matching and document tools.

- [ ] **Step 5: Add FOIR eligibility**

Add `calculateFoirEligibilityTool({ monthlyIncome, monthlyObligations, proposedEmi })` with finite/non-negative validation, rounded current/projected ratios, bands `strong <= .45`, `moderate <= .55`, otherwise `stretch`, and the existing indicative lender-assessment disclaimer. Expose it as `check_eligibility` to public and CRM scopes.

- [ ] **Step 6: Enforce web disclosure after model generation**

If the executed knowledge tool returned `source: 'web_search'`, append exactly once:

```text
*Web search*

Sources:
- <source URL>

This information was not available in the configured database. Please confirm it with an administrator before relying on it.
```

Store `source: 'web_search'` and URLs in `AssistantMessage.metadata`. If web search is blocked/unavailable, use a safe inability message and do not let model prose claim verified facts.

- [ ] **Step 7: Add `FIRECRAWL_API_KEY` to environment examples**

No SDK dependency is added.

- [ ] **Step 8: Run focused tests and typecheck**

Run the three focused test files and `npx.cmd tsc --noEmit --project tsconfig.json` from `LOANAPP_ROOT/backend`.

- [ ] **Step 9: Commit Task 4 files**

```powershell
git add backend/src/modules/assistant backend/src/tests/assistantWebSearch.test.ts backend/src/tests/assistantTools.test.ts backend/src/tests/assistantAgent.test.ts backend/.env.example
git commit -m "feat: add safe web-grounded loan answers"
```

### Task 5: Add safe authenticated-profile context

**Files:**
- Modify: `LOANAPP_ROOT/backend/src/modules/assistant/assistant.tools.ts`
- Modify: `LOANAPP_ROOT/backend/src/modules/assistant/assistant.runtime.ts`
- Create: `LOANAPP_ROOT/backend/src/tests/assistantProfile.test.ts`

- [ ] **Step 1: Write failing profile tests**

Assert a chat user receives only name/email/verification state. Assert a LoanApp user receives safe profile, role, effective permissions, location, onboarding/KYC state, and scoped partner membership. Assert serialized results do not contain password, refresh token, OTP, PAN, Aadhaar, GST, bank account, IFSC, UPI, or another user's data.

- [ ] **Step 2: Run and verify failure**

Run: `npm.cmd test -- --run src/tests/assistantProfile.test.ts` from `LOANAPP_ROOT/backend`.

- [ ] **Step 3: Implement explicit Prisma selects**

Add `get_authenticated_profile`; query `chatUser` when `ctx.chatUserId` exists, otherwise query exactly the allowed `User` fields plus active partner membership. For admin roles, reuse `getRolePermissions`. Do not fetch a full `User` and redact afterward.

- [ ] **Step 4: Run profile tests and typecheck**

Expected: focused test and backend typecheck pass.

- [ ] **Step 5: Commit Task 5 files**

```powershell
git add backend/src/modules/assistant/assistant.tools.ts backend/src/modules/assistant/assistant.runtime.ts backend/src/tests/assistantProfile.test.ts
git commit -m "feat: expose safe assistant profile context"
```

### Task 6: Convert `/agent/agent` to a LoanApp-only chat client

**Files:**
- Create: `AGENT_ROOT/src/lib/loanAppApi.ts`
- Modify: `AGENT_ROOT/src/components/ChatWorkspace.tsx`
- Modify: `AGENT_ROOT/src/app/page.tsx`
- Modify: `AGENT_ROOT/src/app/layout.tsx`
- Delete: `AGENT_ROOT/src/app/chat/page.tsx`
- Replace: `AGENT_ROOT/src/tests/chat-client.test.ts`

- [ ] **Step 1: Write failing client tests**

Test that the client:

```ts
uses NEXT_PUBLIC_LOANAPP_API_URL directly
persists one anonymous UUID in localStorage
sends credentials and an in-memory chat access token
refreshes chat auth through /api/auth/chat/refresh
lists, loads, sends, and deletes owned PostgreSQL conversations
starts Google login at /api/auth/chat/google
does not expose CRM/admin modes or a pasted-token field
```

- [ ] **Step 2: Run and verify failure**

Run: `npm.cmd test -- --run src/tests/chat-client.test.ts` from `AGENT_ROOT`.

- [ ] **Step 3: Implement one browser API module**

Use native `fetch` with `credentials: 'include'`. Keep the access token in module memory. On initial load call chat refresh, then `me`; anonymous failures remain anonymous. All assistant calls use `sessionId`; authenticated calls additionally use the Bearer token. Keep localStorage values limited to `assistantSessionId`, active conversation ID, and theme.

- [ ] **Step 4: Simplify the workspace UI**

Keep one Lending Advisor mode, server-backed history, message formatting, new/open/delete conversation controls, theme, and optional Google sign-in/sign-out. Remove dashboard navigation, partner sign-in text, CRM/admin/partner mode selection, pasted JWT, and local full-message/session storage.

- [ ] **Step 5: Make `/` the only chat screen**

Render `ChatWorkspace` directly from `src/app/page.tsx`. Update metadata to loan and finance guidance only.

- [ ] **Step 6: Run client test, typecheck, and build**

Run: `npm.cmd test -- --run src/tests/chat-client.test.ts`, `npx.cmd tsc --noEmit`, and `npm.cmd run build` from `AGENT_ROOT`.

- [ ] **Step 7: Commit Task 6 files**

```powershell
git add src/lib/loanAppApi.ts src/components/ChatWorkspace.tsx src/app/page.tsx src/app/layout.tsx src/app/chat/page.tsx src/tests/chat-client.test.ts
git commit -m "feat: connect chat UI to LoanApp"
```

### Task 7: Delete the standalone backend and management surfaces

**Files:**
- Delete: `AGENT_ROOT/src/app/api/**`
- Delete: `AGENT_ROOT/src/app/dashboard/**`
- Delete: `AGENT_ROOT/src/app/embed/**`
- Delete: `AGENT_ROOT/src/app/login/**`
- Delete: `AGENT_ROOT/src/app/onboarding/**`
- Delete: `AGENT_ROOT/src/agents/**`
- Delete: `AGENT_ROOT/src/jobs/**`
- Delete: legacy dashboard/embed/onboarding components under `AGENT_ROOT/src/components`
- Delete: all obsolete server/database/model files under `AGENT_ROOT/src/lib` and `AGENT_ROOT/src/model`
- Delete: tests for deleted standalone behavior under `AGENT_ROOT/src/tests`
- Delete: `AGENT_ROOT/public/widget.js`
- Delete: `AGENT_ROOT/src/proxy.ts`
- Modify: `AGENT_ROOT/package.json`
- Modify: `AGENT_ROOT/package-lock.json`

- [ ] **Step 1: Capture the keep-list**

Keep only the app shell/styles, `ChatWorkspace`, `FormattedChatMessage`, formatting helper, `loanAppApi`, theme/types needed by those files, and their focused tests.

- [ ] **Step 2: Delete legacy files with one repository-local removal**

Remove ScaleKit auth, partner onboarding, dashboard, bot CRUD/settings/analytics/knowledge, embed/widget, Mongo/Mongoose models, Redis cache, local PostgreSQL, local agents/LLMs/RAG, standalone CRM/admin, WhatsApp, briefings, cron, and duplicate bridges. Do not delete any LoanApp file.

- [ ] **Step 3: Remove unused dependencies**

Run from `AGENT_ROOT`:

```powershell
npm.cmd uninstall @google/genai @scalekit-sdk/node @types/pg cheerio ioredis jose mammoth mongoose pdf-parse pg zod @types/pdf-parse
```

Keep only Next.js, React, styling, TypeScript, ESLint, and Vitest dependencies actually imported by the remaining files.

- [ ] **Step 4: Verify no legacy references remain**

Run:

```powershell
rg -n "scalekit|mongoose|mongodb|ioredis|redis|partner sign|dashboard|custom bot|/api/chat|/embed|whatsapp|crm|admin" src package.json public
```

Expected: no runtime legacy matches; documentation-specific matches are handled in Task 8.

- [ ] **Step 5: Run all remaining Agent tests, typecheck, and build**

Run: `npm.cmd test`, `npx.cmd tsc --noEmit`, and `npm.cmd run build` from `AGENT_ROOT`.

- [ ] **Step 6: Commit Task 7 files**

```powershell
git add -A
git commit -m "refactor: remove standalone chatbot backend"
```

### Task 8: Update integration documentation and verify both repositories

**Files:**
- Modify: `AGENT_ROOT/docs/learn/README.md`
- Modify: `AGENT_ROOT/docs/learn/01-project-map.md`
- Modify: `AGENT_ROOT/docs/learn/02-architecture.md`
- Modify: `AGENT_ROOT/docs/learn/03-chat-flows.md`
- Modify: `AGENT_ROOT/docs/learn/04-data-and-integrations.md`
- Modify: `AGENT_ROOT/docs/learn/05-development-playbook.md`
- Modify: `AGENT_ROOT/docs/learn/06-reading-checklist.md`
- Modify: `AGENT_ROOT/README.md`
- Modify: `LOANAPP_ROOT/README.md`

- [ ] **Step 1: Document the current end state**

Document every kept Agent file and every LoanApp integration file, all assistant/chat-auth routes, principal/ownership rules, PostgreSQL tables, full message metadata, OAuth cookie/token flow, database-first/web fallback, exact disclosure, safe profile boundaries, environment variables, local commands, deployments, CORS, retention, and failure behavior.

- [ ] **Step 2: Mark legacy/removal scope explicitly**

Include a table mapping ScaleKit, partner onboarding/dashboard, custom bots, embed/widget, MongoDB, Redis, local PostgreSQL/RAG/LLM, standalone CRM/admin, WhatsApp, and cron to either “removed from Agent” or “preserved only in LoanApp”. State that the documented LoanApp source is `.worktrees/chat-bot` until merged upstream.

- [ ] **Step 3: Verify documentation paths**

Run from `AGENT_ROOT`:

```powershell
rg -n "ChatClient|ScaleKit|Mongo|Redis|partner onboarding|custom bot|assistant_conversations|chat_users|chat_auth_sessions|FIRECRAWL|NEXT_PUBLIC_LOANAPP_API_URL" docs/learn README.md
```

Expected: no stale `ChatClient` references; legacy technologies appear only in clearly marked removed-scope sections; canonical integrations are all present.

- [ ] **Step 4: Run LoanApp verification**

From `LOANAPP_ROOT` run:

```powershell
npm.cmd test --prefix backend
npx.cmd tsc --noEmit --project backend/tsconfig.json
npm.cmd test
npm.cmd run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Run Agent verification**

From `AGENT_ROOT` run:

```powershell
npm.cmd test
npx.cmd tsc --noEmit
npm.cmd run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Review both diffs for scope**

Confirm LoanApp partner onboarding, roles, permissions, organization scoping, CRM tools, WhatsApp behavior, chatbot governance, and existing widgets remain present. Confirm Agent contains no server/database/model secret path and no full conversation content in localStorage.

- [ ] **Step 7: Commit documentation**

Commit documentation in each repository without staging unrelated LoanApp worktree changes.

