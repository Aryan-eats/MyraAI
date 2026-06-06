import { appendLeadPartnerNote } from "@/lib/gpsBridge"
import { sendBulkWhatsapp, sendWhatsappMessage } from "@/lib/whatsapp"
import type { AuthenticatedPartner, WhatsappMessage } from "@/types/agents"

export async function sendWhatsapp(
  args:
    | {
        mode: "single"
        message: WhatsappMessage
      }
    | {
        mode: "bulk"
        messages: WhatsappMessage[]
      },
  chatUser: AuthenticatedPartner,
) {
  if (args.mode === "bulk") {
    return sendBulkWhatsapp(args.messages, { token: chatUser.token, partnerId: chatUser.partnerId })
  }

  const result = await sendWhatsappMessage(args.message, {
    token: chatUser.token,
    partnerId: chatUser.partnerId,
  })

  if (args.message.leadId) {
    await appendLeadPartnerNote(
      {
        leadId: args.message.leadId,
        note: `WhatsApp template '${args.message.templateName}' sent with status: ${result.status}`,
        visibility: "visible_to_ops",
      },
      {
        token: chatUser.token,
        authPartnerId: chatUser.partnerId,
        targetPartnerId: chatUser.partnerId,
      },
    )
  }

  return result
}
