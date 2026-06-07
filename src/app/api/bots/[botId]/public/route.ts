import { NextRequest, NextResponse } from "next/server"
import connectDb from "@/lib/db"
import Bot from "@/model/Bot"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  try {
    await connectDb()
    const { botId } = await params
    const bot = await Bot.findById(botId)

    if (!bot || bot.status !== "active") {
      return NextResponse.json(
        { error: "Bot not found", code: "BOT_NOT_FOUND" },
        { status: 404 },
      )
    }

    return NextResponse.json({
      name: bot.name,
      welcomeMessage: bot.welcomeMessage,
      primaryColor: bot.primaryColor,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch bot"
    return NextResponse.json({ error: message, code: "FETCH_ERROR" }, { status: 500 })
  }
}
