import ChatClient from "@/components/ChatClient"
import { getSession } from "@/lib/getSession"

export const dynamic = "force-dynamic"

type ChatPageProps = {
  searchParams?: Promise<{ ownerId?: string; mode?: string }>
}

const VALID_MODES = ["web", "crm", "partner", "admin"] as const
type ChatMode = (typeof VALID_MODES)[number]

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const session = await getSession()
  const params = searchParams ? await searchParams : {}
  const ownerId = params?.ownerId || session?.user?.id || ""
  const rawMode = params?.mode ?? "web"
  const mode: ChatMode = (VALID_MODES as readonly string[]).includes(rawMode)
    ? (rawMode as ChatMode)
    : "web"

  return <ChatClient ownerId={ownerId} mode={mode} />
}
