import { GoogleGenAI } from "@google/genai"
import type { GeminiMessage } from "@/types/agents"

type ToolDeclaration = {
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

type ToolBundle = {
  functionDeclarations: readonly ToolDeclaration[]
}

type ProviderName = "gemini" | "openai" | "claude"

type GenerateWithToolsParams = {
  systemInstruction: string
  messages: GeminiMessage[]
  tools?: readonly ToolBundle[]
  temperature?: number
}

type GenerateTextParams = {
  systemInstruction?: string
  message: string
  temperature?: number
  jsonMode?: boolean
}

type GeneratedPart = {
  text?: string
  functionCall?: {
    name: string
    args?: Record<string, unknown>
  }
}

export type UnifiedGenerateResult = {
  text?: string
  candidates: Array<{
    content: {
      parts: GeneratedPart[]
    }
  }>
}

type OpenAiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }
  | { role: "tool"; tool_call_id: string; name: string; content: string }

type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string }

type ClaudeMessage = {
  role: "user" | "assistant"
  content: ClaudeContentBlock[]
}

type ProviderDraft = {
  provider: ProviderName
  text: string
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash"
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-3-7-sonnet-latest"
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"
const OPENROUTER_OPENAI_MODEL = process.env.OPENROUTER_OPENAI_MODEL || "openai/gpt-4o-mini"
const OPENROUTER_CLAUDE_MODEL = process.env.OPENROUTER_CLAUDE_MODEL || "anthropic/claude-3.7-sonnet"
const DEFAULT_PROVIDER_ORDER: ProviderName[] = ["gemini", "openai", "claude"]
const ENSEMBLE_MODE = "ensemble"

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function normalizeProvider(value: string): ProviderName | null {
  if (value === "gemini" || value === "openai" || value === "claude") {
    return value
  }
  return null
}

function providerOrder() {
  const raw = (process.env.LLM_PROVIDER_ORDER || DEFAULT_PROVIDER_ORDER.join(","))
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  const unique = Array.from(new Set(raw))
  const providers = unique
    .map(normalizeProvider)
    .filter((provider): provider is ProviderName => Boolean(provider))

  return providers.length ? providers : DEFAULT_PROVIDER_ORDER
}

function getClaudeApiKey() {
  return process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || ""
}

function getOpenRouterApiKey() {
  return process.env.OPENROUTER_API_KEY || ""
}

function shouldUseOpenRouterForProvider(provider: ProviderName) {
  return (provider === "openai" || provider === "claude") && Boolean(getOpenRouterApiKey())
}

function hasProviderKey(provider: ProviderName) {
  if (provider === "gemini") {
    return Boolean(process.env.GEMINI_API_KEY)
  }
  if (provider === "openai") {
    return Boolean(process.env.OPENAI_API_KEY) || shouldUseOpenRouterForProvider(provider)
  }
  return Boolean(getClaudeApiKey()) || shouldUseOpenRouterForProvider(provider)
}

export function hasConfiguredLlmProvider() {
  return providerOrder().some((provider) => hasProviderKey(provider))
}

function getEnabledProviders() {
  return providerOrder().filter((provider) => hasProviderKey(provider))
}

function orchestrationMode() {
  const mode = process.env.LLM_ORCHESTRATION_MODE?.trim().toLowerCase()
  return mode === ENSEMBLE_MODE ? ENSEMBLE_MODE : "fallback"
}

function synthesisProvider(preferredProviders: ProviderName[]) {
  const requested = normalizeProvider((process.env.LLM_SYNTHESIS_PROVIDER || "").trim().toLowerCase())
  if (requested && preferredProviders.includes(requested)) {
    return requested
  }
  return preferredProviders[0]
}

function shouldUseEnsemble(params: GenerateTextParams, enabledProviders: ProviderName[]) {
  if (params.jsonMode) {
    return false
  }
  return orchestrationMode() === ENSEMBLE_MODE && enabledProviders.length >= 2
}

function toGeminiContents(messages: GeminiMessage[]) {
  return messages.map((message) => {
    if (typeof message.content === "string") {
      return {
        role: message.role,
        parts: [{ text: message.content }],
      }
    }
    return {
      role: message.role,
      parts: message.content.parts,
    }
  })
}

function toOpenAiMessages(systemInstruction: string, messages: GeminiMessage[]): OpenAiMessage[] {
  const openAiMessages: OpenAiMessage[] = [{ role: "system", content: systemInstruction }]
  const pendingToolCallIds: string[] = []
  let toolCounter = 0

  for (const message of messages) {
    if (typeof message.content === "string") {
      if (message.role === "user") {
        openAiMessages.push({ role: "user", content: message.content })
      } else {
        openAiMessages.push({ role: "assistant", content: message.content })
      }
      continue
    }

    const textParts = message.content.parts.map((part) => part.text || "").join("").trim()
    const functionCalls = message.content.parts.filter((part) => part.functionCall)
    const functionResponses = message.content.parts.filter((part) => part.functionResponse)

    if (message.role === "model") {
      if (functionCalls.length > 0) {
        const toolCalls = functionCalls.map((part) => {
          toolCounter += 1
          const id = `tool_${toolCounter}`
          pendingToolCallIds.push(id)
          return {
            id,
            type: "function" as const,
            function: {
              name: part.functionCall?.name || "unknown_tool",
              arguments: JSON.stringify(part.functionCall?.args || {}),
            },
          }
        })

        openAiMessages.push({
          role: "assistant",
          content: textParts || null,
          tool_calls: toolCalls,
        })
      } else {
        openAiMessages.push({ role: "assistant", content: textParts })
      }
      continue
    }

    if (textParts) {
      openAiMessages.push({ role: "user", content: textParts })
    }

    for (const response of functionResponses) {
      const fallbackId = `tool_${toolCounter + 1}`
      const toolCallId = pendingToolCallIds.shift() || fallbackId
      toolCounter += 1
      openAiMessages.push({
        role: "tool",
        tool_call_id: toolCallId,
        name: response.functionResponse?.name || "unknown_tool",
        content: JSON.stringify(response.functionResponse?.response ?? {}),
      })
    }
  }

  return openAiMessages
}

function toOpenAiTools(tools?: readonly ToolBundle[]) {
  if (!tools?.length) {
    return undefined
  }
  const declarations = tools.flatMap((bundle) => bundle.functionDeclarations || [])
  if (!declarations.length) {
    return undefined
  }
  return declarations.map((declaration) => ({
    type: "function",
    function: {
      name: declaration.name,
      description: declaration.description,
      parameters: declaration.parameters || { type: "object", properties: {} },
    },
  }))
}

function toClaudeMessages(messages: GeminiMessage[]): ClaudeMessage[] {
  const pendingToolCallIds: string[] = []
  let toolCounter = 0
  const claudeMessages: ClaudeMessage[] = []

  for (const message of messages) {
    const blocks: ClaudeContentBlock[] = []

    if (typeof message.content === "string") {
      blocks.push({ type: "text", text: message.content })
    } else {
      for (const part of message.content.parts) {
        if (part.text) {
          blocks.push({ type: "text", text: part.text })
        }
        if (message.role === "model" && part.functionCall) {
          toolCounter += 1
          const id = `tool_${toolCounter}`
          pendingToolCallIds.push(id)
          blocks.push({
            type: "tool_use",
            id,
            name: part.functionCall.name,
            input: part.functionCall.args || {},
          })
        }
        if (message.role === "user" && part.functionResponse) {
          const toolUseId = pendingToolCallIds.shift() || `tool_${toolCounter + 1}`
          blocks.push({
            type: "tool_result",
            tool_use_id: toolUseId,
            content: JSON.stringify(part.functionResponse.response ?? {}),
          })
        }
      }
    }

    if (!blocks.length) {
      continue
    }

    claudeMessages.push({
      role: message.role === "model" ? "assistant" : "user",
      content: blocks,
    })
  }

  return claudeMessages
}

function toClaudeTools(tools?: readonly ToolBundle[]) {
  if (!tools?.length) {
    return undefined
  }
  const declarations = tools.flatMap((bundle) => bundle.functionDeclarations || [])
  if (!declarations.length) {
    return undefined
  }
  return declarations.map((declaration) => ({
    name: declaration.name,
    description: declaration.description || "",
    input_schema: declaration.parameters || { type: "object", properties: {} },
  }))
}

function normalizeOpenAiResult(raw: Record<string, unknown>): UnifiedGenerateResult {
  const firstChoice = Array.isArray(raw.choices) ? (raw.choices[0] as Record<string, unknown>) : undefined
  const message = (firstChoice?.message as Record<string, unknown>) || {}
  const content = typeof message.content === "string" ? message.content : ""
  const toolCalls = Array.isArray(message.tool_calls) ? (message.tool_calls as Array<Record<string, unknown>>) : []

  const parts: GeneratedPart[] = []
  if (content.trim()) {
    parts.push({ text: content })
  }

  for (const toolCall of toolCalls) {
    const fn = toolCall.function as Record<string, unknown> | undefined
    const name = typeof fn?.name === "string" ? fn.name : undefined
    if (!name) {
      continue
    }
    const args = typeof fn?.arguments === "string" ? parseJsonObject(fn.arguments) : {}
    parts.push({
      functionCall: {
        name,
        args,
      },
    })
  }

  return {
    text: content || undefined,
    candidates: [{ content: { parts } }],
  }
}

function normalizeClaudeResult(raw: Record<string, unknown>): UnifiedGenerateResult {
  const contentBlocks = Array.isArray(raw.content) ? (raw.content as Array<Record<string, unknown>>) : []
  const parts: GeneratedPart[] = []

  for (const block of contentBlocks) {
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
      parts.push({ text: block.text })
      continue
    }

    if (block.type === "tool_use" && typeof block.name === "string") {
      parts.push({
        functionCall: {
          name: block.name,
          args: typeof block.input === "object" && block.input !== null ? (block.input as Record<string, unknown>) : {},
        },
      })
    }
  }

  const text = parts
    .map((part) => part.text || "")
    .join("")
    .trim()

  return {
    text: text || undefined,
    candidates: [{ content: { parts } }],
  }
}

function getOpenRouterHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getOpenRouterApiKey()}`,
  }
  if (process.env.OPENROUTER_SITE_URL) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL
  }
  if (process.env.OPENROUTER_APP_NAME) {
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME
  }
  return headers
}

async function callOpenRouterChatCompletion(
  provider: "openai" | "claude",
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!getOpenRouterApiKey()) {
    throw new Error("OPENROUTER_API_KEY is missing.")
  }

  const model = provider === "openai" ? OPENROUTER_OPENAI_MODEL : OPENROUTER_CLAUDE_MODEL
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: getOpenRouterHeaders(),
    body: JSON.stringify({
      ...body,
      model,
    }),
  })

  if (!response.ok) {
    const payload = await response.text()
    throw new Error(`OpenRouter ${provider} completion failed: ${response.status} ${payload}`)
  }

  return (await response.json()) as Record<string, unknown>
}

async function callGeminiWithTools(params: GenerateWithToolsParams): Promise<UnifiedGenerateResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing.")
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    config: {
      systemInstruction: params.systemInstruction,
      tools: params.tools,
      temperature: params.temperature ?? 0.1,
    },
    contents: toGeminiContents(params.messages),
  } as never)

  return result as UnifiedGenerateResult
}

async function callGeminiText(params: GenerateTextParams): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing.")
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    config: {
      systemInstruction: params.systemInstruction,
      temperature: params.temperature ?? 0.2,
      responseMimeType: params.jsonMode ? "application/json" : undefined,
    },
    contents: [{ role: "user", parts: [{ text: params.message }] }],
  } as never)
  return (result as { text?: string }).text ?? ""
}

async function callOpenAiWithTools(params: GenerateWithToolsParams): Promise<UnifiedGenerateResult> {
  if (shouldUseOpenRouterForProvider("openai")) {
    const parsed = await callOpenRouterChatCompletion("openai", {
      temperature: params.temperature ?? 0.1,
      messages: toOpenAiMessages(params.systemInstruction, params.messages),
      tools: toOpenAiTools(params.tools),
      tool_choice: "auto",
    })
    return normalizeOpenAiResult(parsed)
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing.")
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: params.temperature ?? 0.1,
      messages: toOpenAiMessages(params.systemInstruction, params.messages),
      tools: toOpenAiTools(params.tools),
      tool_choice: "auto",
    }),
  })

  if (!response.ok) {
    const payload = await response.text()
    throw new Error(`OpenAI completion failed: ${response.status} ${payload}`)
  }

  const parsed = (await response.json()) as Record<string, unknown>
  return normalizeOpenAiResult(parsed)
}

async function callOpenAiText(params: GenerateTextParams): Promise<string> {
  if (shouldUseOpenRouterForProvider("openai")) {
    const body: Record<string, unknown> = {
      temperature: params.temperature ?? 0.2,
      messages: [
        ...(params.systemInstruction ? [{ role: "system", content: params.systemInstruction }] : []),
        { role: "user", content: params.message },
      ],
    }

    if (params.jsonMode) {
      body.response_format = { type: "json_object" }
    }

    const parsed = await callOpenRouterChatCompletion("openai", body)
    const firstChoice = Array.isArray(parsed.choices) ? (parsed.choices[0] as Record<string, unknown>) : undefined
    const message = (firstChoice?.message as Record<string, unknown>) || {}
    return typeof message.content === "string" ? message.content : ""
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing.")
  }
  const body: Record<string, unknown> = {
    model: OPENAI_MODEL,
    temperature: params.temperature ?? 0.2,
    messages: [
      ...(params.systemInstruction ? [{ role: "system", content: params.systemInstruction }] : []),
      { role: "user", content: params.message },
    ],
  }

  if (params.jsonMode) {
    body.response_format = { type: "json_object" }
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const payload = await response.text()
    throw new Error(`OpenAI completion failed: ${response.status} ${payload}`)
  }

  const parsed = (await response.json()) as Record<string, unknown>
  const firstChoice = Array.isArray(parsed.choices) ? (parsed.choices[0] as Record<string, unknown>) : undefined
  const message = (firstChoice?.message as Record<string, unknown>) || {}
  const content = typeof message.content === "string" ? message.content : ""
  return content
}

async function callClaudeWithTools(params: GenerateWithToolsParams): Promise<UnifiedGenerateResult> {
  if (shouldUseOpenRouterForProvider("claude")) {
    const parsed = await callOpenRouterChatCompletion("claude", {
      temperature: params.temperature ?? 0.1,
      messages: toOpenAiMessages(params.systemInstruction, params.messages),
      tools: toOpenAiTools(params.tools),
      tool_choice: "auto",
    })
    return normalizeOpenAiResult(parsed)
  }

  const apiKey = getClaudeApiKey()
  if (!apiKey) {
    throw new Error("CLAUDE_API_KEY or ANTHROPIC_API_KEY is missing.")
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      system: params.systemInstruction,
      max_tokens: 2048,
      temperature: params.temperature ?? 0.1,
      tools: toClaudeTools(params.tools),
      messages: toClaudeMessages(params.messages),
    }),
  })

  if (!response.ok) {
    const payload = await response.text()
    throw new Error(`Claude completion failed: ${response.status} ${payload}`)
  }

  const parsed = (await response.json()) as Record<string, unknown>
  return normalizeClaudeResult(parsed)
}

async function callClaudeText(params: GenerateTextParams): Promise<string> {
  if (shouldUseOpenRouterForProvider("claude")) {
    const body: Record<string, unknown> = {
      temperature: params.temperature ?? 0.2,
      messages: [
        ...(params.systemInstruction ? [{ role: "system", content: params.systemInstruction }] : []),
        { role: "user", content: params.message },
      ],
    }

    if (params.jsonMode) {
      body.response_format = { type: "json_object" }
    }

    const parsed = await callOpenRouterChatCompletion("claude", body)
    const firstChoice = Array.isArray(parsed.choices) ? (parsed.choices[0] as Record<string, unknown>) : undefined
    const message = (firstChoice?.message as Record<string, unknown>) || {}
    return typeof message.content === "string" ? message.content : ""
  }

  const apiKey = getClaudeApiKey()
  if (!apiKey) {
    throw new Error("CLAUDE_API_KEY or ANTHROPIC_API_KEY is missing.")
  }

  const userMessage = params.jsonMode
    ? `${params.message}\n\nRespond with a single valid JSON object and no surrounding commentary.`
    : params.message

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      system: params.systemInstruction,
      max_tokens: 2048,
      temperature: params.temperature ?? 0.2,
      messages: [{ role: "user", content: [{ type: "text", text: userMessage }] }],
    }),
  })

  if (!response.ok) {
    const payload = await response.text()
    throw new Error(`Claude completion failed: ${response.status} ${payload}`)
  }

  const parsed = (await response.json()) as Record<string, unknown>
  return normalizeClaudeResult(parsed).text || ""
}

async function runWithFallback<T>(execute: (provider: ProviderName) => Promise<T>) {
  const enabledProviders = getEnabledProviders()
  if (!enabledProviders.length) {
    throw new Error("No LLM providers configured. Set GEMINI_API_KEY, OPENAI_API_KEY, or CLAUDE_API_KEY.")
  }

  const failures: string[] = []
  for (const provider of enabledProviders) {
    try {
      return await execute(provider)
    } catch (error) {
      failures.push(`${provider}:${String(error)}`)
    }
  }

  throw new Error(`All configured LLM providers failed. ${failures.join(" | ")}`)
}

async function callProviderText(provider: ProviderName, params: GenerateTextParams) {
  if (provider === "gemini") {
    return callGeminiText(params)
  }
  if (provider === "openai") {
    return callOpenAiText(params)
  }
  return callClaudeText(params)
}

function buildSynthesisPrompt(params: GenerateTextParams, drafts: ProviderDraft[]) {
  const systemSection = params.systemInstruction?.trim()
    ? `System instruction:\n${params.systemInstruction.trim()}\n\n`
    : ""

  const draftSection = drafts
    .map((draft, index) => `Draft ${index + 1} (${draft.provider}):\n${draft.text}`)
    .join("\n\n")

  return [
    "You are an orchestration layer combining multiple LLM drafts into one final answer.",
    "Maximize prompt alignment over style.",
    "Priorities in order:",
    "1. Follow the user's request and system instruction exactly.",
    "2. Preserve concrete constraints, caveats, and requested format.",
    "3. Prefer content repeated across drafts when they agree.",
    "4. Remove speculation, filler, and unsupported claims.",
    "5. If drafts conflict, choose the version that is most directly supported by the prompt and internally consistent.",
    params.jsonMode ? "Return one valid JSON object only." : "Return only the final answer.",
    "",
    systemSection + `User prompt:\n${params.message}\n\nCandidate drafts:\n${draftSection}`,
  ].join("\n")
}

async function generateAlignedText(params: GenerateTextParams, enabledProviders: ProviderName[]) {
  const draftResults = await Promise.allSettled(
    enabledProviders.map(async (provider) => ({
      provider,
      text: await callProviderText(provider, params),
    })),
  )

  const drafts = draftResults
    .filter((result): result is PromiseFulfilledResult<ProviderDraft> => result.status === "fulfilled")
    .map((result) => result.value)
    .filter((draft) => draft.text.trim().length > 0)

  if (!drafts.length) {
    const failures = draftResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => String(result.reason))
    throw new Error(`All ensemble providers failed. ${failures.join(" | ")}`)
  }

  if (drafts.length === 1) {
    return drafts[0].text
  }

  const synthProvider = synthesisProvider(drafts.map((draft) => draft.provider))
  return callProviderText(synthProvider, {
    systemInstruction: params.systemInstruction,
    message: buildSynthesisPrompt(params, drafts),
    temperature: 0,
    jsonMode: params.jsonMode,
  })
}

export async function generateWithTools(params: GenerateWithToolsParams): Promise<UnifiedGenerateResult> {
  return runWithFallback((provider) => {
    if (provider === "gemini") {
      return callGeminiWithTools(params)
    }
    if (provider === "openai") {
      return callOpenAiWithTools(params)
    }
    return callClaudeWithTools(params)
  })
}

export async function generateText(params: GenerateTextParams): Promise<string> {
  const enabledProviders = getEnabledProviders()
  if (!enabledProviders.length) {
    throw new Error("No LLM providers configured. Set GEMINI_API_KEY, OPENAI_API_KEY, or CLAUDE_API_KEY.")
  }

  if (shouldUseEnsemble(params, enabledProviders)) {
    return generateAlignedText(params, enabledProviders)
  }

  return runWithFallback((provider) => callProviderText(provider, params))
}
