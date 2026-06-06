import { NextRequest, NextResponse } from "next/server"
import { getChatUser } from "@/lib/chatAuth"
import { CrmAssistantService } from "@/server/crm-assistant/service"
import { AssistantRequest } from "@/server/crm-assistant/types"

const service = new CrmAssistantService()

type RouteBody = {
  message: string
  conversationId?: string
  sessionId?: string
  actor?: AssistantRequest["actor"]
  conversation?: AssistantRequest["conversation"]
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(payload, { status })
  response.headers.set("Access-Control-Allow-Origin", "*")
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  return response
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RouteBody
    if (!body.message?.trim()) {
      return jsonResponse({ message: "message is required" }, 400)
    }

    const chatUser = await getChatUser(req)
    const actor =
      body.actor ??
      (chatUser.authenticated
        ? {
            userId: chatUser.userId,
            role: chatUser.userRole === "admin" ? "admin" : "partner",
            partnerId: chatUser.entityId,
          }
        : process.env.NODE_ENV === "production"
          ? null
          : {
              userId: "demo_partner_user",
              role: "partner" as const,
              partnerId: "partner_1",
            })

    if (!actor) {
      return jsonResponse({ message: "Authentication is required for CRM assistant access." }, 401)
    }

    const payload: AssistantRequest = {
      message: body.message,
      conversationId: body.conversationId,
      sessionId: body.sessionId,
      actor,
      conversation: body.conversation,
    }

    const result = await service.handle(payload)
    return jsonResponse(result)
  } catch (error) {
    return jsonResponse({ message: String(error) }, 500)
  }
}

export const OPTIONS = async () => {
  return NextResponse.json(null, {
    status: 201,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}
