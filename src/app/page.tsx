import HomeClient from "@/components/HomeClient";
import { getSession } from "@/lib/getSession";
import { needsOnboarding } from "@/lib/onboarding";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic"


export default async function Home() {
  const session=await getSession()
  const ownerId = session?.user?.id ?? ""

  if (ownerId && await needsOnboarding(ownerId)) {
    redirect("/onboarding")
  }
  
  return (
  <>
  <HomeClient email={session?.user?.email ?? ""} ownerId={ownerId}/>
  </>
  );
}
