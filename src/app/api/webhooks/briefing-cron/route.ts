import { NextRequest, NextResponse } from "next/server"
import { generateMorningBriefing } from "@/lib/briefingGenerator"
import { fetchPartnerContacts } from "@/lib/gpsBridge"

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status })
}

function validateCronSecret(req: NextRequest) {
  const headerSecret = req.headers.get("x-briefing-secret")
  return !!headerSecret && !!process.env.BRIEFING_CRON_SECRET && headerSecret === process.env.BRIEFING_CRON_SECRET
}

export async function POST(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return jsonResponse({ message: "Invalid cron secret." }, 401)
  }

  if (process.env.ENABLE_MORNING_BRIEF !== "true") {
    return jsonResponse({ message: "Morning brief feature disabled." }, 200)
  }

  const serviceToken = process.env.GPS_SERVICE_TOKEN || process.env.GPS_INTERNAL_TOKEN
  if (!serviceToken) {
    return jsonResponse({ message: "Service token missing." }, 500)
  }

  try {
    const activePartners = await fetchPartnerContacts({ token: serviceToken })
    const partners = activePartners.filter((p) => p.isActive)

    const results = await Promise.allSettled(partners.map((partner) => generateMorningBriefing(partner.partnerId)))

    return jsonResponse({
      scheduledAt: new Date().toISOString(),
      total: partners.length,
      success: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    })
  } catch (error) {
    return jsonResponse({ message: String(error) }, 500)
  }
}
