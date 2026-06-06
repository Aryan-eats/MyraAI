import { appendLeadPartnerNote } from "@/lib/gpsBridge"
import type { AuthenticatedPartner } from "@/types/agents"

export async function addPartnerNote(
  args: {
    leadId: string
    note: string
    visibility: "partner_only" | "visible_to_ops" | "visible_to_applicant"
  },
  chatUser: AuthenticatedPartner,
) {
  return appendLeadPartnerNote(
    {
      leadId: args.leadId,
      note: args.note,
      visibility: args.visibility,
    },
    {
      token: chatUser.token,
      authPartnerId: chatUser.partnerId,
      targetPartnerId: chatUser.partnerId,
    },
  )
}
