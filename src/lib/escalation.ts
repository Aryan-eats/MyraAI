import connectDb from "@/lib/db"
import Escalation from "@/model/escalation.model"
import { ChatUser } from "@/lib/chatAuth"
import { ChatIntent } from "@/lib/intentRules"

type EscalationInput = {
  chatUser: ChatUser
  message: string
  intent: ChatIntent
  confidence: number
  reason: string
  conversation?: Array<{ role: "user" | "assistant"; text: string }>
}

const ESCALATION_MESSAGE = "I've flagged this for our team, someone will follow up within 2 hours."

async function sendEscalationWebhook(payload: Record<string, unknown>) {
  if (!process.env.GPS_INDIA_WEBHOOK_URL) {
    return
  }

  await fetch(process.env.GPS_INDIA_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => undefined)
}

export async function escalateConversation(input: EscalationInput) {
  const summary = `${input.reason} | intent=${input.intent} | confidence=${input.confidence.toFixed(2)}`

  await connectDb()
  await Escalation.create({
    userId: input.chatUser.userId,
    userRole: input.chatUser.userRole,
    reason: input.reason,
    summary,
    intent: input.intent,
    confidence: input.confidence,
    messages: [...(input.conversation ?? []), { role: "user", text: input.message, createdAt: new Date() }],
  })

  await sendEscalationWebhook({
    userId: input.chatUser.userId,
    userRole: input.chatUser.userRole,
    intent: input.intent,
    reason: input.reason,
    confidence: input.confidence,
    message: input.message,
    summary,
  })

  return ESCALATION_MESSAGE
}

export async function triggerHumanHandoff(params: {
  channel: "web" | "crm"
  userId: string
  partnerId?: string
  reason: string
  transcript?: Array<{ role: "user" | "assistant"; text: string }>
}) {
  await sendEscalationWebhook({
    source: "myra-agent",
    type: "human_handoff",
    ...params,
    createdAt: new Date().toISOString(),
  })
}
