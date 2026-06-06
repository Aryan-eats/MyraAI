export async function captureLead(input: { name: string; phone: string; intentSummary: string }) {
  const sanitizedPhone = input.phone.replace(/\D/g, "")
  if (sanitizedPhone.length < 10) {
    throw new Error("Please share a valid phone number.")
  }

  if (!process.env.GPS_INDIA_WEBHOOK_URL) {
    return {
      captured: true,
      queued: false,
      note: "Lead captured in chat. CRM webhook is not configured yet.",
    }
  }

  await fetch(process.env.GPS_INDIA_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "myra-web",
      type: "lead_capture",
      payload: {
        name: input.name,
        phone: sanitizedPhone,
        intentSummary: input.intentSummary,
        capturedAt: new Date().toISOString(),
      },
    }),
  })

  return {
    captured: true,
    queued: true,
    note: "Lead forwarded to GPS India team for callback.",
  }
}
