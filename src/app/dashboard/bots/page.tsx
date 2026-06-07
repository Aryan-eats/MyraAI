import { redirect } from "next/navigation"
import { getSession } from "@/lib/getSession"
import BotsManager from "@/components/Dashboard/BotsManager"

export const dynamic = "force-dynamic"

export default async function BotsPage() {
  const session = await getSession()
  const ownerId = session?.user?.id

  if (!ownerId) {
    redirect("/login")
  }

  return <BotsManager />
}
