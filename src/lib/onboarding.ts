import connectDb from "@/lib/db"
import Bot from "@/model/Bot"

export async function needsOnboarding(ownerId: string): Promise<boolean> {
  try {
    await connectDb()
    const bot = await Bot.findOne({ ownerId }, { _id: 1 }).lean()
    return !bot
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to determine onboarding state"
    throw new Error(message)
  }
}
