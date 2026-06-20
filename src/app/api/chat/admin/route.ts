import { NextRequest, NextResponse } from "next/server"
import { runAdminChatbot } from "@/agents/admin/agent"
import { requireAdminAuth } from "@/lib/chatAuth"
import { hasConfiguredLlmProvider } from "@/lib/llm/router"
import { loadConversationHistory, saveConversationHistory } from "@/lib/gemini"

export const runtime = "nodejs"

type AdminChatBody = {
  message: string
  sessionId?: string
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminAuth(req)
  if (!admin) {
    return jsonResponse({ error: "Admin access is required.", code: "FORBIDDEN" }, 403)
  }

  try {
    if (!hasConfiguredLlmProvider()) {
      return jsonResponse({ error: "No LLM provider is configured.", code: "LLM_UNAVAILABLE" }, 503)
    }

    const body = (await req.json()) as AdminChatBody
    if (!body.message?.trim()) {
      return jsonResponse({ error: "message is required", code: "MISSING_MESSAGE" }, 400)
    }

    const sessionId = body.sessionId || req.headers.get("x-session-id") || crypto.randomUUID()
    const history = await loadConversationHistory(sessionId)

    const result = await runAdminChatbot(body.message, history, admin)

    await saveConversationHistory(sessionId, [
      ...history,
      { role: "user", content: body.message },
      { role: "model", content: result.text },
    ])

    return jsonResponse({
      sessionId,
      answer: result.text,
      toolsUsed: result.toolsUsed,
    })
  } catch (error) {
    const errorId = crypto.randomUUID()
    console.error(`[myra-admin][${errorId}]`, error)
    return jsonResponse(
      { error: "Myra is temporarily unavailable. Please try again.", code: "INTERNAL_ERROR", errorId },
      500,
    )
  }
}
