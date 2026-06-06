import { runSoftCheck as executeSoftCheck } from "@/lib/softCheckEngine"
import type { AuthenticatedPartner } from "@/types/agents"

export async function runSoftCheck(args: { leadId: string }, chatUser: AuthenticatedPartner) {
  return executeSoftCheck(args.leadId, chatUser.partnerId, { token: chatUser.token })
}
