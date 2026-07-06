• delete: demo CRM assistant stack. Use /api/chat/crm or delete the demo card. /C:/Users/risha/OneDrive/Desktop/agent/agent/src/server/crm-assistant/
  types.ts /C:/Users/risha/OneDrive/Desktop/agent/agent/src/app/api/crm-assistant/route.ts

  yagni: multi-provider LLM ensemble/router sprawl. Keep one provider plus fallback; delete synthesis mode. /C:/Users/risha/OneDrive/Desktop/agent/
  agent/src/lib/llm/router.ts

  stdlib: OpenRouter wrapper uses openai SDK for an OpenAI-compatible HTTP API. Use fetch; cut wrapper/tests/smoke script. /C:/Users/risha/OneDrive/
  Desktop/agent/agent/src/lib/llm/openrouter.ts

  delete: legacy ownerId embed path. widget.js with data-bot-id already replaced it. /C:/Users/risha/OneDrive/Desktop/agent/agent/public/chatBot.js /
  C:/Users/risha/OneDrive/Desktop/agent/agent/src/components/EmbedClient.tsx

  native: node-cron job duplicates the webhook cron. Use platform cron hitting /api/webhooks/briefing-cron. /C:/Users/risha/OneDrive/Desktop/agent/
  agent/src/jobs/morningBriefing.ts

  native: axios for four client calls. Use fetch; delete dependency. /C:/Users/risha/OneDrive/Desktop/agent/agent/src/components/ChatClient.tsx

  native: motion only drives simple enter/hover animations. Use CSS transitions or skip them; delete dependency. /C:/Users/risha/OneDrive/Desktop/
  agent/agent/src/components/HomeClient.tsx

  shrink: POST /api/settings/get route. Make it GET /api/settings?ownerId=... in the existing route. /C:/Users/risha/OneDrive/Desktop/agent/agent/src/
  app/api/settings/get/route.ts

  stdlib: uuid and @types/uuid are unused. crypto.randomUUID() is already used. /C:/Users/risha/OneDrive/Desktop/agent/agent/package.json
