import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectDb from "@/lib/db"
import { getSession } from "@/lib/getSession"
import Bot from "@/model/Bot"
import ChatSession from "@/model/ChatSession"
import KnowledgeChunk from "@/model/KnowledgeChunk"
import KnowledgeSource from "@/model/KnowledgeSource"

const updateBotSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  systemPrompt: z.string().min(1).max(4000).optional(),
  primaryColor: z.string().min(4).max(32).optional(),
  welcomeMessage: z.string().min(1).max(500).optional(),
  fallbackMessage: z.string().min(1).max(500).optional(),
  allowedDomains: z.array(z.string().min(1)).optional(),
  status: z.enum(["active", "inactive"]).optional(),
})

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

async function getOwnedBot(botId: string, ownerId: string) {
  return Bot.findOne({ _id: botId, ownerId })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  try {
    const session = await getSession()
    const ownerId = session?.user?.id
    if (!ownerId) {
      return errorResponse("Owner authentication required", "UNAUTHORIZED", 401)
    }

    const { botId } = await params
    await connectDb()
    const bot = await getOwnedBot(botId, ownerId)

    if (!bot) {
      return errorResponse("Bot not found", "BOT_NOT_FOUND", 404)
    }

    return NextResponse.json({ bot })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch bot"
    return errorResponse(message, "FETCH_ERROR", 500)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  try {
    const session = await getSession()
    const ownerId = session?.user?.id
    if (!ownerId) {
      return errorResponse("Owner authentication required", "UNAUTHORIZED", 401)
    }

    const { botId } = await params
    await connectDb()
    const body = updateBotSchema.parse(await req.json())

    const updatedBot = await Bot.findOneAndUpdate(
      { _id: botId, ownerId },
      { $set: body },
      { new: true, runValidators: true },
    ).lean()

    if (!updatedBot) {
      return errorResponse("Bot not found", "BOT_NOT_FOUND", 404)
    }

    return NextResponse.json({ bot: updatedBot })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400)
    }
    const message = error instanceof Error ? error.message : "Failed to update bot"
    return errorResponse(message, "UPDATE_ERROR", 500)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  try {
    const session = await getSession()
    const ownerId = session?.user?.id
    if (!ownerId) {
      return errorResponse("Owner authentication required", "UNAUTHORIZED", 401)
    }

    const { botId } = await params
    await connectDb()
    const deletedBot = await Bot.findOneAndDelete({ _id: botId, ownerId })

    if (!deletedBot) {
      return errorResponse("Bot not found", "BOT_NOT_FOUND", 404)
    }

    await KnowledgeSource.deleteMany({ botId })
    await KnowledgeChunk.deleteMany({ botId })
    await ChatSession.deleteMany({ botId })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete bot"
    return errorResponse(message, "DELETE_ERROR", 500)
  }
}
