type CaptureLeadInput = {
  name: string
  phone: string
  intentSummary: string
  loanType?: string
  loanAmount?: number
  email?: string
  city?: string
  employmentType?: string
}

export async function captureLead(input: CaptureLeadInput) {
  const sanitizedPhone = input.phone.replace(/\D/g, "")
  if (sanitizedPhone.length < 10) {
    throw new Error("Please share a valid phone number.")
  }

  const apiBaseUrl = process.env.GPS_INDIA_API_URL?.replace(/\/$/, "")
  if (apiBaseUrl) {
    const missingFields = [
      !input.loanType ? "loanType" : null,
      typeof input.loanAmount !== "number" ? "loanAmount" : null,
    ].filter(Boolean)

    if (missingFields.length) {
      return {
        captured: false,
        queued: false,
        missingFields,
        note: "Loan type and amount are required before creating a lead.",
      }
    }

    const response = await fetch(`${apiBaseUrl}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: input.name,
        phone: sanitizedPhone,
        loanType: input.loanType,
        loanAmount: input.loanAmount,
        ...(input.email ? { email: input.email } : {}),
        ...(input.city ? { city: input.city } : {}),
        ...(input.employmentType ? { employmentType: input.employmentType } : {}),
      }),
    })

    if (!response.ok) {
      throw new Error("Lead capture failed.")
    }

    const payload = (await response.json()) as {
      data?: { lead?: { id?: string }; leadToken?: string }
    }

    return {
      captured: true,
      queued: true,
      leadId: payload.data?.lead?.id,
      leadToken: payload.data?.leadToken,
      note: "Lead submitted to GPS India team for callback.",
    }
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
