# Chatbot Response Generation Architecture

This document explains how responses are generated across all chatbot modes in this repo, with exact code references.

## Mode Entry Points

The first-party chat page supports four modes: `web`, `crm`, `partner`, and `admin`.

- `src/app/chat/page.tsx:10` defines `VALID_MODES = ["web", "crm", "partner", "admin"]`.
- `src/app/chat/page.tsx:17` defaults missing `mode` query params to `web`.
- `src/app/chat/page.tsx:18` rejects unknown modes and falls back to `web`.
- `src/app/chat/page.tsx:22` renders `ChatClient` with the resolved mode.

`ChatClient` maps each mode to its API endpoint and UI copy:

- `src/components/ChatClient.tsx:13` defines `ChatMode`.
- `src/components/ChatClient.tsx:20` defines `MODE_CONFIG`.
- `src/components/ChatClient.tsx:24` maps `web` to `/api/chat/web`.
- `src/components/ChatClient.tsx:32` maps `crm` to `/api/chat/crm`.
- `src/components/ChatClient.tsx:40` maps `partner` to `/api/chat/partner`.
- `src/components/ChatClient.tsx:48` maps `admin` to `/api/chat/admin`.
- `src/components/ChatClient.tsx:87` sends the request to `config.endpoint`.
- `src/components/ChatClient.tsx:103` reads `data.answer` as the assistant text.
- `src/components/ChatClient.tsx:167` shows tool names returned by the API.

There is also an embedded/public bot path:

- `src/components/Chat/EmbedChat.tsx:120` posts widget messages to `/api/chat`.
- `src/app/api/chat/route.ts:340` routes requests with `body.botId` into the bot-specific RAG flow.

## Shared Response Stack

All agent modes eventually call the shared Gemini-compatible wrapper:

- `src/lib/gemini.ts:111` exports `generateWithTools`.
- `src/lib/gemini.ts:140` exports `generateText`.
- `src/lib/gemini.ts:123` and `src/lib/gemini.ts:146` delegate to `src/lib/llm/router.ts`.

The provider router is provider-agnostic:

- `src/lib/llm/router.ts:82` sets default provider order: `openrouter`, `gemini`, `openai`, `claude`.
- `src/lib/llm/router.ts:100` lets `LLM_PROVIDER_ORDER` override that order.
- `src/lib/llm/router.ts:129` checks whether any configured provider has a key.
- `src/lib/llm/router.ts:137` converts internal messages to Gemini contents.
- `src/lib/llm/router.ts:152` converts internal messages to OpenAI/OpenRouter format.
- `src/lib/llm/router.ts:331`, `src/lib/llm/router.ts:366`, and `src/lib/llm/router.ts:497` implement Gemini, OpenAI, and Claude tool calls.
- `src/lib/llm/router.ts:523` runs providers with fallback.
- `src/lib/llm/router.ts:549` exports tool generation with fallback.
- `src/lib/llm/router.ts:564` exports plain text generation with fallback.

Conversation history for the dedicated mode endpoints is Redis-backed:

- `src/lib/gemini.ts:10` sets a 2-hour Redis TTL.
- `src/lib/gemini.ts:11` keeps only the latest 20 messages.
- `src/lib/gemini.ts:52` loads history from `conv:${sessionId}`.
- `src/lib/gemini.ts:68` saves trimmed history.
- `src/lib/gemini.ts:87` can persist a close-session summary to MongoDB and delete Redis history.

## Web Mode

Endpoint:

- `src/app/api/chat/web/route.ts:22` rejects requests if no LLM provider is configured.
- `src/app/api/chat/web/route.ts:35` loads Redis conversation history.
- `src/app/api/chat/web/route.ts:37` calls `runWebAgent`.
- `src/app/api/chat/web/route.ts:39` saves the user message and final model text.
- `src/app/api/chat/web/route.ts:45` optionally summarizes on `endSession`.
- `src/app/api/chat/web/route.ts:54` returns `answer: result.text`.
- `src/app/api/chat/web/route.ts:55` returns `toolsUsed`.

Prompt and policy:

- `src/agents/web/persona.ts:1` defines `getWebSystemPrompt`.
- `src/agents/web/persona.ts:3` identifies Myra as GPS India's website lending advisor.
- `src/agents/web/persona.ts:6` starts tool/data instructions.
- `src/agents/web/persona.ts:15` starts safety and style rules.

Agent architecture:

- `src/agents/web/agent.ts:11` declares the web tools.
- `src/agents/web/agent.ts:95` dispatches tool calls to implementations.
- `src/agents/web/agent.ts:152` makes the first LLM call with tools.
- `src/agents/web/agent.ts:168` returns direct text if the model does not request a tool.
- `src/agents/web/agent.ts:175` executes the requested tool.
- `src/agents/web/agent.ts:183` makes a second LLM call with the tool result.
- `src/agents/web/agent.ts:217` extracts final text from the second pass.

Web mode is a two-pass, single-tool flow:

1. The model receives the user message, conversation history, web persona, and web tool declarations.
2. If the model returns plain text, that text is returned directly.
3. If the model returns one tool call, the server executes that tool.
4. The model receives the function call and function response, then writes the final user-facing answer.

Web tools:

- `src/agents/web/tools/searchKnowledge.ts:20` searches lender/product knowledge.
- `src/agents/web/tools/compareProducts.ts:12` compares products.
- `src/agents/web/tools/getDocuments.ts:9` returns document requirements.
- `src/agents/web/tools/calculateEmi.ts:12` calculates EMI.
- `src/agents/web/tools/checkEligibility.ts:1` estimates FOIR-based eligibility.
- `src/agents/web/tools/captureLead.ts:1` captures lead intent.

## CRM Mode

Endpoint:

- `src/app/api/chat/crm/route.ts:21` requires partner authentication.
- `src/app/api/chat/crm/route.ts:33` loads Redis conversation history.
- `src/app/api/chat/crm/route.ts:35` calls `runCrmAgent`.
- `src/app/api/chat/crm/route.ts:37` saves the user message and final model text.
- `src/app/api/chat/crm/route.ts:43` optionally summarizes on `endSession`.
- `src/app/api/chat/crm/route.ts:52` returns `answer: result.text`.
- `src/app/api/chat/crm/route.ts:53` returns `toolsUsed`.

Prompt and policy:

- `src/agents/crm/persona.ts:3` defines `getCrmSystemPrompt`.
- `src/agents/crm/persona.ts:5` gives Myra full access to the partner's pipeline, clients, documents, and communication tools.
- `src/agents/crm/persona.ts:7` starts operating rules.
- `src/agents/crm/persona.ts:15` injects current partner context.

Agent architecture:

- `src/agents/crm/agent.ts:19` declares CRM tools.
- `src/agents/crm/agent.ts:90` dispatches CRM tool calls.
- `src/agents/crm/agent.ts:138` allows up to 8 iterations.
- `src/agents/crm/agent.ts:145` calls the LLM with tools and CRM persona.
- `src/agents/crm/agent.ts:172` executes requested tool calls in parallel.
- `src/agents/crm/agent.ts:189` throws if the loop never reaches a terminal text response.

CRM mode is an action-capable multi-tool loop:

1. The route authenticates the partner.
2. The agent sends history plus the current message to the model.
3. If the model returns only text, that is the final answer.
4. If the model returns one or more tool calls, the server executes them in parallel and appends function responses.
5. The loop repeats until the model returns text or 8 iterations are exhausted.

CRM tools:

- `src/agents/crm/tools/sendWhatsapp.ts:5` sends single or bulk WhatsApp messages.
- `src/agents/crm/tools/analyseDocument.ts:6` analyzes uploaded documents.
- `src/agents/crm/tools/runSoftCheck.ts:4` runs a soft check on a lead.
- `src/agents/crm/tools/generateBriefing.ts:4` generates a partner briefing.
- `src/agents/crm/tools/addPartnerNote.ts:4` appends a partner note.
- `src/agents/crm/tools/queryPipeline.ts:5` fetches active/stalled/pending pipeline data.
- `src/agents/crm/tools/getCommissions.ts:5` fetches commission data.

## Partner Mode

Endpoint:

- `src/app/api/chat/partner/route.ts:19` requires partner authentication.
- `src/app/api/chat/partner/route.ts:25` rejects requests if no LLM provider is configured.
- `src/app/api/chat/partner/route.ts:38` loads Redis conversation history.
- `src/app/api/chat/partner/route.ts:40` calls `runPartnerChatbot`.
- `src/app/api/chat/partner/route.ts:42` saves the user message and final model text.
- `src/app/api/chat/partner/route.ts:50` returns `answer: result.text`.
- `src/app/api/chat/partner/route.ts:51` returns `toolsUsed`.

Prompt and policy:

- `src/agents/partner/persona.ts:10` defines `getPartnerChatbotPrompt`.
- `src/agents/partner/persona.ts:12` identifies Myra as the partner's operations assistant.
- `src/agents/partner/persona.ts:19` sets the read-only boundary.
- `src/agents/partner/persona.ts:23` starts response rules.
- `src/agents/partner/persona.ts:28` injects current partner context.

Agent architecture:

- `src/agents/partner/agent.ts:11` declares partner tools.
- `src/agents/partner/agent.ts:51` dispatches partner tools.
- `src/agents/partner/agent.ts:78` defines the fallback answer.
- `src/agents/partner/agent.ts:91` allows up to 6 iterations.
- `src/agents/partner/agent.ts:101` calls the LLM with tools.
- `src/agents/partner/agent.ts:124` executes tool calls in parallel.
- `src/agents/partner/agent.ts:149` returns fallback text if no terminal response is reached.

Partner mode is read-only. It mirrors CRM's loop but catches model/tool failures and returns a useful fallback instead of throwing.

Partner tools:

- `src/agents/partner/tools/getPipelineOverview.ts:4` returns the partner pipeline overview.
- `src/agents/partner/tools/getLeadStatus.ts:9` finds lead status by name or status.
- `src/agents/partner/tools/getMissingDocsList.ts:7` lists leads needing document attention.
- `src/agents/partner/tools/getCommissionOverview.ts:4` returns commission totals.
- `src/agents/partner/tools/getStalledLeadsList.ts:4` lists stalled leads.

## Admin Mode

Endpoint:

- `src/app/api/chat/admin/route.ts:19` requires admin authorization.
- `src/app/api/chat/admin/route.ts:25` rejects requests if no LLM provider is configured.
- `src/app/api/chat/admin/route.ts:35` loads Redis conversation history.
- `src/app/api/chat/admin/route.ts:37` calls `runAdminChatbot`.
- `src/app/api/chat/admin/route.ts:39` saves the user message and final model text.
- `src/app/api/chat/admin/route.ts:47` returns `answer: result.text`.
- `src/app/api/chat/admin/route.ts:48` returns `toolsUsed`.

Prompt and policy:

- `src/agents/admin/persona.ts:8` defines `getAdminChatbotPrompt`.
- `src/agents/admin/persona.ts:10` identifies Myra as the internal operations assistant.
- `src/agents/admin/persona.ts:16` sets the read-only boundary.
- `src/agents/admin/persona.ts:19` starts response rules.
- `src/agents/admin/persona.ts:23` injects current admin identity and role.

Agent architecture:

- `src/agents/admin/agent.ts:11` declares admin tools.
- `src/agents/admin/agent.ts:50` dispatches admin tools.
- `src/agents/admin/agent.ts:71` defines the fallback answer.
- `src/agents/admin/agent.ts:81` allows up to 6 iterations.
- `src/agents/admin/agent.ts:91` calls the LLM with tools.
- `src/agents/admin/agent.ts:114` executes tool calls in parallel.
- `src/agents/admin/agent.ts:139` returns fallback text if no terminal response is reached.

Admin mode is platform-wide but read-only.

Admin tools:

- `src/agents/admin/tools/getPlatformOverview.ts:4` returns platform summary.
- `src/agents/admin/tools/getPartnerPerformance.ts:7` ranks or filters partner performance.
- `src/agents/admin/tools/getBankStats.ts:4` returns bank-wise volume and approval stats.
- `src/agents/admin/tools/getLeadsByStatusAdmin.ts:4` lists leads by status.

## Embedded Bot and Legacy `/api/chat`

`/api/chat` has two architectures depending on request shape.

### Bot RAG Flow

When `botId` is present:

- `src/app/api/chat/route.ts:57` validates bot chat requests.
- `src/app/api/chat/route.ts:106` enters `runBotChatFlow`.
- `src/app/api/chat/route.ts:108` loads the bot config.
- `src/app/api/chat/route.ts:115` loads or creates a `ChatSession`.
- `src/app/api/chat/route.ts:126` retrieves relevant chunks.
- `src/app/api/chat/route.ts:127` builds knowledge context.
- `src/app/api/chat/route.ts:133` builds recent conversation context.
- `src/app/api/chat/route.ts:135` builds the system prompt from bot settings, RAG chunks, and history.
- `src/app/api/chat/route.ts:148` generates a text reply.
- `src/app/api/chat/route.ts:154` saves user and assistant messages.

This path is stricter than the mode endpoints: it instructs the model to answer only from retrieved knowledge and otherwise use the bot fallback message.

### Legacy Authenticated Flow

When `botId` is absent:

- `src/app/api/chat/route.ts:320` handles POST.
- `src/app/api/chat/route.ts:322` validates request origin.
- `src/app/api/chat/route.ts:345` resolves the chat user.
- `src/app/api/chat/route.ts:346` applies rate limiting.
- `src/app/api/chat/route.ts:354` tries rule-based intent classification.
- `src/app/api/chat/route.ts:356` checks cached responses.
- `src/app/api/chat/route.ts:372` falls back to model-based classification.
- `src/app/api/chat/route.ts:378` escalates out-of-scope or low-confidence requests.
- `src/app/api/chat/route.ts:397` blocks anonymous users from non-FAQ data.
- `src/app/api/chat/route.ts:408` handles `general_faq`.
- `src/app/api/chat/route.ts:451` runs the GPS tool flow for mapped tool intents.
- `src/app/api/chat/route.ts:458` caches tool-flow answers.

Supporting files:

- `src/lib/intentRules.ts:102` implements rule-based classification.
- `src/lib/geminiTools.ts:86` defines the model intent-classifier prompt.
- `src/lib/geminiTools.ts:3` defines tool declarations for the legacy flow.
- `src/lib/chatCache.ts:34` and `src/lib/chatCache.ts:50` read/write cached answers.
- `src/lib/retrieval.ts:30` retrieves bot knowledge chunks.
- `src/lib/escalation.ts:29` generates escalation responses.

## Authentication and Scope

Token extraction and identity resolution are centralized:

- `src/lib/chatAuth.ts:41` reads bearer tokens or `gpsToken` query params.
- `src/lib/chatAuth.ts:49` calls `${GPS_INDIA_API_URL}/internal/me`.
- `src/lib/chatAuth.ts:82` verifies JWT signature if `GPS_JWT_PUBLIC_KEY` is configured.
- `src/lib/chatAuth.ts:103` resolves a generic chat user for `/api/chat`.
- `src/lib/chatAuth.ts:128` enforces partner auth.
- `src/lib/chatAuth.ts:142` switches partner auth to Postgres-backed org resolution when available.
- `src/lib/chatAuth.ts:147` resolves the partner org for the user.
- `src/lib/chatAuth.ts:179` enforces admin auth.
- `src/lib/chatAuth.ts:197` loads the user from Postgres for admin auth.
- `src/lib/chatAuth.ts:198` checks active status and allowed admin roles.

## Important Behavioral Notes

1. `ChatClient` sends local `conversation` only for CRM at `src/components/ChatClient.tsx:82`, but `src/app/api/chat/crm/route.ts` does not read that field. Actual CRM history comes from Redis via `sessionId`.

2. Web mode handles only one tool call per request. It uses the first function call from the first model pass (`src/agents/web/agent.ts:168` to `src/agents/web/agent.ts:183`) and does not loop through multiple calls.

3. CRM mode can perform write/actions (`send_whatsapp`, `add_partner_note`) because its persona and tools allow that. Partner and admin modes explicitly forbid writes in their personas and expose only read tools.

4. CRM throws `AgentLoopError` if no terminal text response is reached (`src/agents/crm/agent.ts:189`). Partner and admin return fallback messages instead (`src/agents/partner/agent.ts:149`, `src/agents/admin/agent.ts:139`).

5. The four dedicated mode endpoints use Redis message history through `src/lib/gemini.ts`; embedded bot sessions use MongoDB `ChatSession` records in `src/app/api/chat/route.ts:115` and `src/app/api/chat/route.ts:154`.

6. The provider router normalizes different providers into one Gemini-like result shape. That lets the agent loops look only for `candidate.content.parts`, `text`, and `functionCall` regardless of provider.

## High-Level Architecture Diagram

```text
First-party /chat page
  src/app/chat/page.tsx
  -> src/components/ChatClient.tsx
  -> /api/chat/web      -> runWebAgent      -> generateWithTools/generateText -> LLM router
  -> /api/chat/crm      -> runCrmAgent      -> generateWithTools             -> LLM router
  -> /api/chat/partner  -> runPartnerChatbot-> generateWithTools             -> LLM router
  -> /api/chat/admin    -> runAdminChatbot  -> generateWithTools             -> LLM router

Embedded widget
  src/components/Chat/EmbedChat.tsx
  -> /api/chat with botId
  -> runBotChatFlow
  -> retrieveRelevantChunks + bot systemPrompt + ChatSession history
  -> generateText -> LLM router

Legacy /api/chat without botId
  -> auth + rate limit
  -> cache
  -> rule classifier or model classifier
  -> FAQ generation, GPS tool flow, or escalation
```
