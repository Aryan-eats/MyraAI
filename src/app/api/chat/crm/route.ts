import { NextRequest, NextResponse } from "next/server"
import { runCrmAgent } from "@/agents/crm/agent"
import { requirePartnerAuth } from "@/lib/chatAuth"
import {
  loadConversationHistory,
  saveConversationHistory,
  summarizeAndCloseConversation,
} from "@/lib/gemini"

type CrmChatBody = {
  message: string
  sessionId?: string
  endSession?: boolean
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status })
}

export async function POST(req: NextRequest) {
  const auth = await requirePartnerAuth(req)
  if (!auth) {
    return jsonResponse({ message: "Valid partner JWT is required." }, 401)
  }

  try {
    const body = (await req.json()) as CrmChatBody
    if (!body.message?.trim()) {
      return jsonResponse({ message: "message is required" }, 400)
    }

    const sessionId = body.sessionId || req.headers.get("x-session-id") || crypto.randomUUID()
    const history = await loadConversationHistory(sessionId)

    const result = await runCrmAgent(body.message, history, auth)

    await saveConversationHistory(sessionId, [
      ...history,
      { role: "user", content: body.message },
      { role: "model", content: result.text },
    ])

    if (body.endSession) {
      await summarizeAndCloseConversation(sessionId, {
        facts: [result.text.slice(0, 180)],
        notesAdded: result.toolsUsed.includes("add_partner_note") ? 1 : 0,
      })
    }

    return jsonResponse({
      sessionId,
      answer: result.text,
      toolsUsed: result.toolsUsed,
      iterations: result.iterations,
    })
  } catch (error) {
    return jsonResponse({ message: String(error) }, 500)
  }
}
