import cron from "node-cron"
import { fetchPartnerContacts } from "@/lib/gpsBridge"
import { generateMorningBriefing } from "@/lib/briefingGenerator"

async function runMorningBriefingBatch() {
  if (process.env.ENABLE_MORNING_BRIEF !== "true") {
    return
  }

  const token = process.env.GPS_SERVICE_TOKEN || process.env.GPS_INTERNAL_TOKEN
  if (!token) {
    throw new Error("GPS_SERVICE_TOKEN or GPS_INTERNAL_TOKEN is required")
  }

  const partners = await fetchPartnerContacts({ token })
  const activePartners = partners.filter((partner) => partner.isActive)

  await Promise.allSettled(activePartners.map((partner) => generateMorningBriefing(partner.partnerId)))
}

cron.schedule(
  "0 7 * * *",
  () => {
    runMorningBriefingBatch().catch((error) => {
      console.error("morning briefing cron failed", error)
    })
  },
  {
    timezone: "Asia/Kolkata",
  },
)

// Optional immediate run for manual validation.
if (process.env.RUN_BRIEF_ON_START === "true") {
  runMorningBriefingBatch().catch((error) => {
    console.error("initial morning briefing run failed", error)
  })
}
