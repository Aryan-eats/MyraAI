import { cacheCommissions, getCachedCommissions } from "@/lib/chatCache"
import { fetchPartnerCommissionSnapshot } from "@/lib/gpsBridge"
import type { AuthenticatedPartner } from "@/types/agents"

export async function getCommissions(_args: Record<string, never>, chatUser: AuthenticatedPartner) {
  const cached = await getCachedCommissions<Awaited<ReturnType<typeof fetchPartnerCommissionSnapshot>>>(
    chatUser.partnerId,
  )
  if (cached) {
    return { ...cached, source: "cache" }
  }

  const live = await fetchPartnerCommissionSnapshot({
    token: chatUser.token,
    authPartnerId: chatUser.partnerId,
    targetPartnerId: chatUser.partnerId,
  })
  await cacheCommissions(chatUser.partnerId, live)
  return { ...live, source: "live" }
}
