# Myra AI - Loan Chatbot and CRM Assistant

Myra AI is an AI assistant platform for lending teams. It has two focused assistants:

- `myra-web`: customer-facing loan chatbot for product questions, eligibility guidance, and lead capture
- `myra-crm`: authenticated CRM assistant for partner operations, pipeline work, documents, WhatsApp outreach, and daily briefings

## What it does

- Answers loan product, rate, document, process, and eligibility questions
- Gives indicative FOIR-based loan eligibility guidance
- Captures qualified borrower leads from chat
- Helps CRM users review applications, documents, pipeline status, commissions, and partner notes
- Sends WhatsApp outreach with consent and rate-limit checks
- Generates morning briefings for partner follow-ups
- Uses MongoDB for lending knowledge and CRM brief storage
- Uses Redis for caching and conversation memory

## Assistants

### Customer Loan Chatbot

Path: `src/agents/web`

Endpoint:

```http
POST /api/chat/web
```

The chatbot is public-facing and unauthenticated. It can explain loan options, compare products, estimate eligibility, and collect lead details when the user shows intent.

It does not access private applicant data, CRM records, Aadhaar, PAN, bank account details, or OTPs.

### CRM Assistant

Path: `src/agents/crm`

Endpoint:

```http
POST /api/chat/crm
```

The CRM assistant requires a valid partner JWT. It can use tools for:

- WhatsApp outreach
- Document analysis and checklist gaps
- Soft-check eligibility
- Pipeline and commission queries
- Partner notes
- Morning briefing generation

## API routes

- `POST /api/chat/web`
- `POST /api/chat/crm`
- `POST /api/webhooks/briefing-cron`
- `GET /api/partner/briefing/today`

## Environment variables

Create `.env` from `.env.example` and keep real secrets out of version control.

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

- `.env` is ignored and should stay local.
- `.env.example` contains placeholders only.
- Gemini is first by default, with OpenRouter as fallback.
- Rotate any real provider or database keys that were ever exposed.

## Install and run

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

Current tests cover:

- CRM agent loop behavior
- Soft-check logic
- WhatsApp consent and rate limiting
- Chat auth
- Document analysis redaction and checklist handling
- Web eligibility and product comparison tools

## Seed lending knowledge

Review the seed file first:

- `KNOWLEDGE_BASE_SEED.md`

Then seed products into MongoDB:

```bash
npx tsx src/jobs/seedKnowledge.ts
```

## Morning briefing

Call this route from a scheduler:

```http
POST /api/webhooks/briefing-cron
```

The job runs only when `ENABLE_MORNING_BRIEF=true` and the request includes the correct `x-briefing-secret` header.

## Security model

- Public chatbot has no CRM or private applicant-data access
- CRM endpoint requires partner authentication
- Partner scope is enforced in backend tools, not only in prompts
- WhatsApp sending checks consent and rate limits
- Document analysis stores redacted structured fields only
- Cron webhook validates a shared secret before running

## Tech stack

- Next.js App Router
- TypeScript
- MongoDB and Mongoose
- Redis and ioredis
- Gemini
- OpenRouter
- OpenAI fallback
- Anthropic Claude fallback
- Vitest

## License

Private and proprietary.
