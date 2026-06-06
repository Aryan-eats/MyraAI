import { cachePipeline, getCachedPipeline } from "@/lib/chatCache"
import { fetchPartnerPipelineSnapshot, fetchPartnerTodaysActions } from "@/lib/gpsBridge"
import type { AuthenticatedPartner } from "@/types/agents"

export async function queryPipeline(_args: Record<string, never>, chatUser: AuthenticatedPartner) {
  const cached = await getCachedPipeline<{
    snapshot: Awaited<ReturnType<typeof fetchPartnerPipelineSnapshot>>
    actions: Awaited<ReturnType<typeof fetchPartnerTodaysActions>>
  }>(chatUser.partnerId)

  if (cached) {
    return { ...cached, source: "cache" }
  }

  const [snapshot, actions] = await Promise.all([
    fetchPartnerPipelineSnapshot({
      token: chatUser.token,
      authPartnerId: chatUser.partnerId,
      targetPartnerId: chatUser.partnerId,
    }),
    fetchPartnerTodaysActions({
      token: chatUser.token,
      authPartnerId: chatUser.partnerId,
      targetPartnerId: chatUser.partnerId,
    }),
  ])

  const payload = { snapshot, actions }
  await cachePipeline(chatUser.partnerId, payload)

  return { ...payload, source: "live" }
}
