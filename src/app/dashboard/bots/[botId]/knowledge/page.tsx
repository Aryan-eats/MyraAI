import { redirect } from "next/navigation"
import connectDb from "@/lib/db"
import { getSession } from "@/lib/getSession"
import Bot from "@/model/Bot"
import BotKnowledgeClient from "@/components/Dashboard/BotKnowledgeClient"

export const dynamic = "force-dynamic"

export default async function BotKnowledgePage({
  params,
}: {
  params: Promise<{ botId: string }>
}) {
  const session = await getSession()
  const ownerId = session?.user?.id

  if (!ownerId) {
    redirect("/login")
  }

  const { botId } = await params
  await connectDb()
  const bot = await Bot.findOne({ _id: botId, ownerId }).lean()

  if (!bot) {
    redirect("/dashboard/bots")
  }

  return <BotKnowledgeClient botId={botId} botName={bot.name} />
}
