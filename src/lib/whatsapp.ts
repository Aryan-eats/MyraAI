import type { BulkResult, WhatsappMessage, WhatsappResult } from "@/types/agents"
import { getClientWhatsappConsent, logWhatsappEvent } from "@/lib/gpsBridge"
import { incrementRateLimitCounter } from "@/lib/chatCache"

export const WHATSAPP_TEMPLATES: Record<string, string> = {
  document_reminder:
    "Hi {1}, we need your {2} to process your {3} loan application. Please share it at your earliest. - GPS India",
  status_update: "Hi {1}, your {2} loan application is now {3}. {4}. For queries, reply here. - GPS India",
  disbursement_alert:
    "Congratulations {1}! Your {2} of Rs {3} has been disbursed. Expect credit within {4} working hours. - GPS India",
  emi_reminder:
    "Hi {1}, your EMI of Rs {2} is due on {3}. Please ensure funds are available. - GPS India",
  morning_brief_partner:
    "Good morning {1}! Your GPS India brief: {2} active leads, {3} actions pending today. Open the app for details. - GPS India",
}

function getMetaBaseUrl() {
  return "https://graph.facebook.com/v20.0"
}

function shouldUseStub() {
  return process.env.ENABLE_WHATSAPP !== "true"
}

function sanitizePhone(phone: string) {
  return phone.replace(/\D/g, "")
}

async function postToMeta(payload: Record<string, unknown>) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !token) {
    return { messages: [{ id: "missing_config" }] }
  }

  const response = await fetch(`${getMetaBaseUrl()}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Meta WhatsApp API error (${response.status})`)
  }

  return (await response.json()) as { messages?: Array<{ id: string }> }
}

export async function sendWhatsappMessage(
  msg: WhatsappMessage,
  auth: { token: string; partnerId: string },
): Promise<WhatsappResult> {
  const to = sanitizePhone(msg.to)
  const rateKey = `rate:wa:${msg.partnerId}:hour`
  const count = await incrementRateLimitCounter(rateKey, 3600)

  if (count > 50) {
    await logWhatsappEvent(
      {
        partnerId: msg.partnerId,
        leadId: msg.leadId,
        to,
        templateName: msg.templateName,
        status: "blocked",
        reason: "rate_limit_exceeded",
      },
      { token: auth.token, authPartnerId: auth.partnerId },
    )
    return { status: "blocked", reason: "Rate limit exceeded (50/hour)." }
  }

  if (msg.leadId) {
    const consent = await getClientWhatsappConsent(
      { partnerId: msg.partnerId, leadId: msg.leadId },
      { token: auth.token, authPartnerId: auth.partnerId, targetPartnerId: msg.partnerId },
    )

    if (!consent.consent) {
      await logWhatsappEvent(
        {
          partnerId: msg.partnerId,
          leadId: msg.leadId,
          to,
          templateName: msg.templateName,
          status: "blocked",
          reason: "consent_missing",
        },
        { token: auth.token, authPartnerId: auth.partnerId },
      )
      return { status: "blocked", reason: "Recipient has not opted in for WhatsApp." }
    }
  }

  if (shouldUseStub()) {
    await logWhatsappEvent(
      {
        partnerId: msg.partnerId,
        leadId: msg.leadId,
        to,
        templateName: msg.templateName,
        status: "stubbed",
        reason: "ENABLE_WHATSAPP=false",
      },
      { token: auth.token, authPartnerId: auth.partnerId },
    )
    return { status: "stubbed", reason: "WhatsApp disabled by feature flag." }
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: msg.templateName,
      language: { code: msg.templateLanguage },
      components: msg.components,
    },
  }

  const metaResponse = await postToMeta(payload)
  const providerMessageId = metaResponse.messages?.[0]?.id

  await logWhatsappEvent(
    {
      partnerId: msg.partnerId,
      leadId: msg.leadId,
      to,
      templateName: msg.templateName,
      status: "sent",
      providerMessageId,
    },
    { token: auth.token, authPartnerId: auth.partnerId },
  )

  return { status: "sent", providerMessageId }
}

export async function sendBulkWhatsapp(
  messages: WhatsappMessage[],
  auth: { token: string; partnerId: string },
): Promise<BulkResult> {
  const results = await Promise.all(
    messages.map(async (message) => ({
      to: message.to,
      result: await sendWhatsappMessage(message, auth),
    })),
  )

  return {
    sent: results.filter((x) => x.result.status === "sent").length,
    blocked: results.filter((x) => x.result.status === "blocked").length,
    failed: results.filter((x) => x.result.status !== "sent" && x.result.status !== "blocked").length,
    results,
  }
}
