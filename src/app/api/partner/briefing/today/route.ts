import { NextRequest, NextResponse } from "next/server"
import connectDb from "@/lib/db"
import { getTodayBriefing, generateMorningBriefing } from "@/lib/briefingGenerator"
import { requirePartnerAuth } from "@/lib/chatAuth"

export async function GET(req: NextRequest) {
  const auth = await requirePartnerAuth(req)
  if (!auth) {
    return NextResponse.json({ message: "Valid partner JWT is required." }, { status: 401 })
  }

  await connectDb()
  let briefing = await getTodayBriefing(auth.partnerId)

  if (!briefing) {
    briefing = await generateMorningBriefing(auth.partnerId)
  }

  return NextResponse.json({ briefing })
}
