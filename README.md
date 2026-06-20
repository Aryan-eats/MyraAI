# Myra AI - GPS India (Dual-Agent System)

Myra AI is a production-grade dual-agent platform for GPS India Financial Services (loan origination + DSA partner management).

It contains two distinct agents with separate auth boundaries, personas, and tool ecosystems:

- `myra-web`: public website lending advisor (unauthenticated, no applicant-data access)
- `myra-crm`: partner CRM operations copilot (strict partner JWT required)

## What this repo includes

- Next.js App Router backend + UI shell
- OpenRouter free-model response generation by default, with Gemini/OpenAI/Claude fallback
- Gemini 2.0 Flash integration for chat + tool use + multimodal document analysis
- MongoDB lending knowledge base (`lending_products`) and partner brief storage
- Redis caching + conversation memory
- GPS backend bridge layer with partner-scope enforcement
- WhatsApp integration wrapper (Meta direct API, feature-flagged)
- Soft-check engine (five-layer eligibility logic)
- Morning briefing generator + cron webhook
- Unit tests with Vitest

## Architecture

### Agent 1: `myra-web`

Path: `src/agents/web`

- Handles public loan product/rate/document/process questions
- Uses knowledge and comparison tools
- Provides FOIR-based indicative eligibility only
- Captures leads naturally when intent is clear
- Never asks for Aadhaar/PAN/account/OTP
- No write access to CRM/partner pipeline

API endpoint:
- `POST /api/chat/web`

### Agent 2: `myra-crm`

Path: `src/agents/crm`

- Multi-step tool-calling agent loop (max 8 iterations)
- Supports:
  - WhatsApp outreach
  - Document analysis + checklist gaps
  - Soft-check execution
  - Pipeline and commission queries
  - Partner notes
  - Morning briefing generation

API endpoint:
- `POST /api/chat/crm` (requires valid partner JWT)

## Key API routes

- `POST /api/chat/web`
- `POST /api/chat/crm`
- `POST /api/webhooks/briefing-cron` (requires `x-briefing-secret`)
- `GET /api/partner/briefing/today` (partner JWT required)

## Environment variables

Create a local `.env` from `.env.example` and keep real secrets out of version control:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.example.mongodb.net/agent
GPS_INDIA_API_URL=http://localhost:4000
GPS_INDIA_WEBHOOK_URL=http://localhost:4000/internal/ops/chat-escalation
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
CLAUDE_API_KEY=your_claude_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_DEFAULT_MODEL=meta-llama/llama-3.3-70b-instruct:free
LLM_PROVIDER_ORDER=gemini,openrouter
REDIS_URL=redis://127.0.0.1:6379
CHAT_ALLOWED_ORIGINS=http://localhost:3000
CHAT_RATE_LIMIT_MAX=30
CHAT_RATE_LIMIT_WINDOW_MS=60000
```

Notes:
- `.env` is ignored and should remain local-only.
- `.env.example` is placeholder-only and safe to commit.
- Gemini is first by default, with OpenRouter as the fallback. Set `LLM_PROVIDER_ORDER` only when you need a different fallback order.
- The previously exposed provider/database keys must still be rotated manually outside the repo.

## Install and run

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

Current unit tests cover:
- CRM agent loop behavior
- Soft-check logic
- WhatsApp consent/rate-limit behavior
- Chat auth
- Document analysis redaction/checklist
- Web eligibility and product comparison tools

## Data seeding

Seed lending products into MongoDB using your TypeScript runner:

```bash
npx tsx src/jobs/seedKnowledge.ts
```

Review seed data before importing:
- `KNOWLEDGE_BASE_SEED.md`

## Briefing job

Call `POST /api/webhooks/briefing-cron` from your platform scheduler.
It executes only if `ENABLE_MORNING_BRIEF=true`.

## Security model

- CRM endpoint rejects unauthenticated requests
- Partner scope enforced in `gpsBridge` (not only at prompt layer)
- WhatsApp send path checks consent + per-partner rate limits
- Document analysis stores only redacted structured fields (no raw documents)
- Cron webhook validates secret header before running

## Additional docs

- `PLAN.md`: build scope, backend dependencies, rollout checklist, test order
- `KNOWLEDGE_BASE_SEED.md`: lender/product seed review sheet

## Tech stack

- Next.js (App Router) + TypeScript
- Node.js
- MongoDB + Mongoose
- Redis + ioredis
- Gemini (`@google/genai`, `gemini-2.5-flash`)
- OpenRouter Chat Completions
- OpenAI Chat Completions fallback
- Anthropic Claude Messages API
- Vitest (unit tests)

## License

Private and proprietary.
