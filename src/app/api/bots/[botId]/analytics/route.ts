import { NextRequest, NextResponse } from "next/server"
import connectDb from "@/lib/db"
import { getSession } from "@/lib/getSession"
import Bot from "@/model/Bot"
import ChatSession from "@/model/ChatSession"

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
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
    const bot = await Bot.findOne({ _id: botId, ownerId })
    if (!bot) {
      return errorResponse("Bot not found", "BOT_NOT_FOUND", 404)
    }

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const result = await ChatSession.aggregate([
      { $match: { botId } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalSessions: { $sum: 1 },
                totalMessages: { $sum: { $size: "$messages" } },
              },
            },
          ],
          last7Days: [
            { $match: { createdAt: { $gte: sevenDaysAgo } } },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$createdAt",
                  },
                },
                sessions: { $sum: 1 },
                messages: { $sum: { $size: "$messages" } },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ])

    const totals = result[0]?.totals?.[0] ?? { totalSessions: 0, totalMessages: 0 }
    const last7Days = result[0]?.last7Days ?? []

    return NextResponse.json({
      totalSessions: totals.totalSessions ?? 0,
      totalMessages: totals.totalMessages ?? 0,
      last7Days,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch analytics"
    return errorResponse(message, "ANALYTICS_ERROR", 500)
  }
}
