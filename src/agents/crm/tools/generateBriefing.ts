import { generateMorningBriefing } from "@/lib/briefingGenerator"
import type { AuthenticatedPartner } from "@/types/agents"

export async function generateBriefing(_args: Record<string, never>, chatUser: AuthenticatedPartner) {
  return generateMorningBriefing(chatUser.partnerId)
}
