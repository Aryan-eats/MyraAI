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

type ProviderName = "openrouter" | "gemini" | "openai" | "claude"

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

type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: "function"
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

type OpenAiTool = {
  type: "function"
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string }

type ClaudeMessage = {
  role: "user" | "assistant"
  content: ClaudeContentBlock[]
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const OPENROUTER_MODEL = process.env.OPENROUTER_DEFAULT_MODEL || process.env.OPENROUTER_FREE_MODEL || "meta-llama/llama-3.3-70b-instruct:free"
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-3-7-sonnet-latest"
const DEFAULT_PROVIDER_ORDER: ProviderName[] = ["gemini", "openrouter"]

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function normalizeProvider(value: string): ProviderName | null {
  if (value === "openrouter" || value === "gemini" || value === "openai" || value === "claude") {
    return value
  }
  return null
}

function providerOrder() {
  const raw = (process.env.LLM_PROVIDER_ORDER || DEFAULT_PROVIDER_ORDER.join(","))
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  const providers = Array.from(new Set(raw))
    .map(normalizeProvider)
    .filter((provider): provider is ProviderName => Boolean(provider))

  return providers.length ? providers : DEFAULT_PROVIDER_ORDER
}

function getClaudeApiKey() {
  return process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || ""
}

function hasProviderKey(provider: ProviderName) {
  if (provider === "openrouter") {
    return Boolean(process.env.OPENROUTER_API_KEY)
  }
  if (provider === "gemini") {
    return Boolean(process.env.GEMINI_API_KEY)
  }
  if (provider === "openai") {
    return Boolean(process.env.OPENAI_API_KEY)
  }
  return Boolean(getClaudeApiKey())
}

export function hasConfiguredLlmProvider() {
  return providerOrder().some((provider) => hasProviderKey(provider))
}

function getEnabledProviders() {
  return providerOrder().filter((provider) => hasProviderKey(provider))
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

function toOpenAiMessages(systemInstruction: string | undefined, messages: GeminiMessage[]): OpenAiMessage[] {
  const openAiMessages: OpenAiMessage[] = systemInstruction ? [{ role: "system", content: systemInstruction }] : []
  const pendingToolCallIds: string[] = []
  let toolCounter = 0

  for (const message of messages) {
    if (typeof message.content === "string") {
      openAiMessages.push({
        role: message.role === "model" ? "assistant" : "user",
        content: message.content,
      })
      continue
    }

    const textParts = message.content.parts.map((part) => part.text || "").join("").trim()
    const functionCalls = message.content.parts.filter((part) => part.functionCall)
    const functionResponses = message.content.parts.filter((part) => part.functionResponse)

    if (message.role === "model") {
      if (functionCalls.length) {
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
      } else if (textParts) {
        openAiMessages.push({ role: "assistant", content: textParts })
      }
      continue
    }

    if (textParts) {
      openAiMessages.push({ role: "user", content: textParts })
    }

    for (const response of functionResponses) {
      const toolCallId = pendingToolCallIds.shift() || `tool_${toolCounter + 1}`
      toolCounter += 1
      openAiMessages.push({
        role: "tool",
        tool_call_id: toolCallId,
        content: JSON.stringify(response.functionResponse?.response ?? {}),
      })
    }
  }

  return openAiMessages
}

function toOpenAiTools(tools?: readonly ToolBundle[]): OpenAiTool[] | undefined {
  const declarations = tools?.flatMap((bundle) => bundle.functionDeclarations || []) ?? []
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

function normalizeOpenAiResult(raw: Record<string, unknown>): UnifiedGenerateResult {
  const choices = raw.choices as unknown
  const firstChoice = Array.isArray(choices) ? (choices[0] as Record<string, unknown>) : undefined
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
    parts.push({ functionCall: { name, args } })
  }

  return {
    text: content || undefined,
    candidates: [{ content: { parts } }],
  }
}

function getOpenAiCompletionText(raw: Record<string, unknown>) {
  return normalizeOpenAiResult(raw).text || ""
}

async function postOpenAiCompatible(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`)
  }

  return (await response.json()) as Record<string, unknown>
}

async function callOpenRouter(params: {
  messages: OpenAiMessage[]
  tools?: OpenAiTool[]
  temperature?: number
  jsonMode?: boolean
}) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is missing.")
  }

  return postOpenAiCompatible(
    OPENROUTER_URL,
    process.env.OPENROUTER_API_KEY,
    {
      model: OPENROUTER_MODEL,
      temperature: params.temperature,
      messages: params.messages,
      tools: params.tools,
      tool_choice: params.tools?.length ? "auto" : undefined,
      response_format: params.jsonMode ? { type: "json_object" } : undefined,
    },
    {
      ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
      ...(process.env.OPENROUTER_APP_NAME ? { "X-Title": process.env.OPENROUTER_APP_NAME } : {}),
    },
  )
}

async function callOpenRouterWithTools(params: GenerateWithToolsParams): Promise<UnifiedGenerateResult> {
  const parsed = await callOpenRouter({
    temperature: params.temperature ?? 0.1,
    messages: toOpenAiMessages(params.systemInstruction, params.messages),
    tools: toOpenAiTools(params.tools),
  })
  return normalizeOpenAiResult(parsed)
}

async function callOpenRouterText(params: GenerateTextParams): Promise<string> {
  const parsed = await callOpenRouter({
    temperature: params.temperature ?? 0.2,
    messages: toOpenAiMessages(params.systemInstruction, [{ role: "user", content: params.message }]),
    jsonMode: params.jsonMode,
  })
  return getOpenAiCompletionText(parsed)
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
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing.")
  }
  const parsed = await postOpenAiCompatible("https://api.openai.com/v1/chat/completions", process.env.OPENAI_API_KEY, {
    model: OPENAI_MODEL,
    temperature: params.temperature ?? 0.1,
    messages: toOpenAiMessages(params.systemInstruction, params.messages),
    tools: toOpenAiTools(params.tools),
    tool_choice: "auto",
  })
  return normalizeOpenAiResult(parsed)
}

async function callOpenAiText(params: GenerateTextParams): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing.")
  }
  const parsed = await postOpenAiCompatible("https://api.openai.com/v1/chat/completions", process.env.OPENAI_API_KEY, {
    model: OPENAI_MODEL,
    temperature: params.temperature ?? 0.2,
    messages: toOpenAiMessages(params.systemInstruction, [{ role: "user", content: params.message }]),
    response_format: params.jsonMode ? { type: "json_object" } : undefined,
  })
  return getOpenAiCompletionText(parsed)
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
          blocks.push({
            type: "tool_result",
            tool_use_id: pendingToolCallIds.shift() || `tool_${toolCounter + 1}`,
            content: JSON.stringify(part.functionResponse.response ?? {}),
          })
        }
      }
    }

    if (blocks.length) {
      claudeMessages.push({
        role: message.role === "model" ? "assistant" : "user",
        content: blocks,
      })
    }
  }

  return claudeMessages
}

function toClaudeTools(tools?: readonly ToolBundle[]) {
  const declarations = tools?.flatMap((bundle) => bundle.functionDeclarations || []) ?? []
  return declarations.length
    ? declarations.map((declaration) => ({
        name: declaration.name,
        description: declaration.description || "",
        input_schema: declaration.parameters || { type: "object", properties: {} },
      }))
    : undefined
}

function normalizeClaudeResult(raw: Record<string, unknown>): UnifiedGenerateResult {
  const contentBlocks = Array.isArray(raw.content) ? (raw.content as Array<Record<string, unknown>>) : []
  const parts: GeneratedPart[] = []

  for (const block of contentBlocks) {
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
      parts.push({ text: block.text })
    } else if (block.type === "tool_use" && typeof block.name === "string") {
      parts.push({
        functionCall: {
          name: block.name,
          args: typeof block.input === "object" && block.input !== null ? (block.input as Record<string, unknown>) : {},
        },
      })
    }
  }

  return {
    text: parts.map((part) => part.text || "").join("").trim() || undefined,
    candidates: [{ content: { parts } }],
  }
}

async function postClaude(body: Record<string, unknown>) {
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
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Claude completion failed: ${response.status} ${await response.text()}`)
  }

  return (await response.json()) as Record<string, unknown>
}

async function callClaudeWithTools(params: GenerateWithToolsParams): Promise<UnifiedGenerateResult> {
  const parsed = await postClaude({
    model: CLAUDE_MODEL,
    system: params.systemInstruction,
    max_tokens: 2048,
    temperature: params.temperature ?? 0.1,
    tools: toClaudeTools(params.tools),
    messages: toClaudeMessages(params.messages),
  })
  return normalizeClaudeResult(parsed)
}

async function callClaudeText(params: GenerateTextParams): Promise<string> {
  const userMessage = params.jsonMode
    ? `${params.message}\n\nRespond with a single valid JSON object and no surrounding commentary.`
    : params.message
  const parsed = await postClaude({
    model: CLAUDE_MODEL,
    system: params.systemInstruction,
    max_tokens: 2048,
    temperature: params.temperature ?? 0.2,
    messages: [{ role: "user", content: [{ type: "text", text: userMessage }] }],
  })
  return normalizeClaudeResult(parsed).text || ""
}

async function runWithFallback<T>(execute: (provider: ProviderName) => Promise<T>) {
  const failures: string[] = []
  for (const provider of getEnabledProviders()) {
    try {
      return await execute(provider)
    } catch (error) {
      console.error("[llm-router]", "provider_failed", {
        provider,
        error: error instanceof Error ? error.message : String(error),
      })
      failures.push(`${provider}:${String(error)}`)
    }
  }

  console.error("[llm-router]", "all_providers_failed", {
    providers: getEnabledProviders(),
    failures,
  })
  throw new Error(`All configured LLM providers failed. ${failures.join(" | ")}`)
}

function callProviderText(provider: ProviderName, params: GenerateTextParams) {
  if (provider === "openrouter") {
    return callOpenRouterText(params)
  }
  if (provider === "gemini") {
    return callGeminiText(params)
  }
  if (provider === "openai") {
    return callOpenAiText(params)
  }
  return callClaudeText(params)
}

export async function generateWithTools(params: GenerateWithToolsParams): Promise<UnifiedGenerateResult> {
  return runWithFallback((provider) => {
    if (provider === "openrouter") {
      return callOpenRouterWithTools(params)
    }
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
  return runWithFallback((provider) => callProviderText(provider, params))
}
