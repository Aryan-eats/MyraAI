import { redirect } from "next/navigation"
import { getSession } from "@/lib/getSession"
import { needsOnboarding } from "@/lib/onboarding"
import OnboardingClient from "@/components/OnboardingClient"

export const dynamic = "force-dynamic"

export default async function OnboardingPage() {
  const session = await getSession()
  const ownerId = session?.user?.id

  if (!ownerId) {
    redirect("/login")
  }

  const showOnboarding = await needsOnboarding(ownerId)
  if (!showOnboarding) {
    redirect("/dashboard/bots")
  }

  return <OnboardingClient ownerId={ownerId} />
}
