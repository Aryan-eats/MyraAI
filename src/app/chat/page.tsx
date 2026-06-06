import ChatClient from "@/components/ChatClient"
import { getSession } from "@/lib/getSession"

type ChatPageProps = {
  searchParams?: Promise<{ ownerId?: string; mode?: string }>
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const session = await getSession()
  const params = searchParams ? await searchParams : {}
  const ownerId = params?.ownerId || session?.user?.id || ""
  const mode = params?.mode === "crm" ? "crm" : "web"

  return <ChatClient ownerId={ownerId} mode={mode} />
}
