import { NextRequest, NextResponse } from "next/server"
import { runWebAgent } from "@/agents/web/agent"
import { hasConfiguredLlmProvider } from "@/lib/llm/router"
import {
  loadConversationHistory,
  saveConversationHistory,
  summarizeAndCloseConversation,
} from "@/lib/gemini"

type WebChatBody = {
  message: string
  sessionId?: string
  endSession?: boolean
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status })
}

export async function POST(req: NextRequest) {
  try {
    if (!hasConfiguredLlmProvider()) {
      return jsonResponse(
        { message: "No LLM provider is configured. Set GEMINI_API_KEY, OPENAI_API_KEY, or CLAUDE_API_KEY." },
        503,
      )
    }

    const body = (await req.json()) as WebChatBody
    if (!body.message?.trim()) {
      return jsonResponse({ message: "message is required" }, 400)
    }

    const sessionId = body.sessionId || req.headers.get("x-session-id") || crypto.randomUUID()
    const history = await loadConversationHistory(sessionId)

    const result = await runWebAgent(body.message, history)

    await saveConversationHistory(sessionId, [
      ...history,
      { role: "user", content: body.message },
      { role: "model", content: result.text },
    ])

    if (body.endSession) {
      await summarizeAndCloseConversation(sessionId, {
        facts: [result.text.slice(0, 180)],
        leadCaptured: result.leadCaptured ? { name: "captured_via_chat", phone: "redacted" } : undefined,
      })
    }

    return jsonResponse({
      sessionId,
      answer: result.text,
      toolsUsed: result.toolsUsed,
      leadCaptured: result.leadCaptured ?? false,
    })
  } catch (error) {
    const errorId = crypto.randomUUID()
    console.error(`[myra-web][${errorId}]`, error)
    return jsonResponse(
      {
        message: "Myra is temporarily unavailable. Please try again.",
        errorId,
      },
      500,
    )
  }
}
