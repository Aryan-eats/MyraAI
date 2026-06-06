import mongoose, { Schema } from "mongoose"
import { generateText } from "@/lib/gemini"
import connectDb from "@/lib/db"
import {
  fetchPartnerCommissionSnapshot,
  fetchPartnerContacts,
  fetchPartnerPipelineSnapshot,
  fetchPartnerRiskFlags,
  fetchPartnerTodaysActions,
  savePartnerBriefing,
} from "@/lib/gpsBridge"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import type { Briefing } from "@/types/agents"

type PartnerBriefingDoc = Briefing & {
  expiresAt: Date
}

const partnerBriefingSchema = new Schema<PartnerBriefingDoc>(
  {
    partnerId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    whatsappSummary: { type: String, required: true },
    inAppSections: {
      pipelineSnapshot: { type: String, required: true },
      priorityActions: { type: [String], default: [] },
      commissionUpdate: { type: String, required: true },
      riskFlags: { type: [String], default: [] },
    },
    expiresAt: { type: Date, required: true, index: { expires: "24h" } },
  },
  { collection: "partner_briefings", timestamps: true },
)

const PartnerBriefingModel =
  (mongoose.models.PartnerBriefing as mongoose.Model<PartnerBriefingDoc>) ||
  mongoose.model<PartnerBriefingDoc>("PartnerBriefing", partnerBriefingSchema)

function getServiceAuth() {
  const token = process.env.GPS_SERVICE_TOKEN || process.env.GPS_INTERNAL_TOKEN
  if (!token) {
    throw new Error("GPS service token is missing. Set GPS_SERVICE_TOKEN for briefing jobs.")
  }
  return token
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function toSimpleActions(actions: Awaited<ReturnType<typeof fetchPartnerTodaysActions>>) {
  return actions
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .slice(0, 8)
    .map((a) => `${a.applicantName} (${a.actionType}) - ${a.note}`)
}

export async function generateMorningBriefing(partnerId: string): Promise<Briefing> {
  await connectDb()
  const token = getServiceAuth()

  const [pipeline, actions, commissions, riskFlags, contacts] = await Promise.all([
    fetchPartnerPipelineSnapshot({ token, authPartnerId: partnerId, targetPartnerId: partnerId }),
    fetchPartnerTodaysActions({ token, authPartnerId: partnerId, targetPartnerId: partnerId }),
    fetchPartnerCommissionSnapshot({ token, authPartnerId: partnerId, targetPartnerId: partnerId }),
    fetchPartnerRiskFlags({ token, authPartnerId: partnerId, targetPartnerId: partnerId }),
    fetchPartnerContacts({ token }),
  ])

  const partner = contacts.find((p) => p.partnerId === partnerId)
  if (!partner) {
    throw new Error(`Partner not found: ${partnerId}`)
  }

  const prompt = [
    "You are a CRM operations copilot.",
    "Write JSON with keys: whatsappSummary, pipelineSnapshot, priorityActions, commissionUpdate, riskFlags.",
    "Keep WhatsApp summary exactly 4 lines and short.",
    `Partner: ${partner.partnerName}`,
    `Pipeline: ${JSON.stringify(pipeline)}`,
    `Actions: ${JSON.stringify(actions)}`,
    `Commissions: ${JSON.stringify(commissions)}`,
    `RiskFlags: ${JSON.stringify(riskFlags)}`,
  ].join("\n")

  const generated = await generateText({ message: prompt, temperature: 0.2 })

  type GeneratedBriefingShape = {
    whatsappSummary: string
    pipelineSnapshot: string
    priorityActions: string[]
    commissionUpdate: string
    riskFlags: string[]
  }
  let parsed: GeneratedBriefingShape | null = null

  try {
    parsed = JSON.parse(generated) as GeneratedBriefingShape
  } catch {
    parsed = null
  }

  const briefing: Briefing = {
    partnerId,
    date: todayIsoDate(),
    whatsappSummary:
      parsed?.whatsappSummary ||
      `Active leads: ${pipeline.totalActiveLeads}\nStalled >7d: ${pipeline.stalledOver7Days}\nToday's actions: ${actions.length}\nOpen app for detailed priorities.`,
    inAppSections: {
      pipelineSnapshot:
        parsed?.pipelineSnapshot ||
        `Active ${pipeline.totalActiveLeads}, stalled ${pipeline.stalledOver7Days}, pending disbursement confirmations ${pipeline.disbursementsPendingConfirmation}.`,
      priorityActions: parsed?.priorityActions?.length ? parsed.priorityActions : toSimpleActions(actions),
      commissionUpdate:
        parsed?.commissionUpdate ||
        `Pending approvals: Rs ${commissions.pendingApproval}. Estimated this week: Rs ${commissions.estimatedCreditThisWeek}. MTD: Rs ${commissions.monthToDate}.`,
      riskFlags:
        parsed?.riskFlags?.length
          ? parsed.riskFlags
          : riskFlags.map((r) => `${r.message} (${r.severity})`).slice(0, 5),
    },
  }

  await PartnerBriefingModel.updateOne(
    { partnerId, date: briefing.date },
    {
      $set: {
        ...briefing,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    },
    { upsert: true },
  )

  await savePartnerBriefing(
    {
      partnerId,
      date: briefing.date,
      whatsappSummary: briefing.whatsappSummary,
      inAppSections: briefing.inAppSections,
    },
    { token, authPartnerId: partnerId, targetPartnerId: partnerId },
  )

  await sendWhatsappMessage(
    {
      to: partner.mobile,
      templateName: "morning_brief_partner",
      templateLanguage: "en",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: partner.partnerName },
            { type: "text", text: String(pipeline.totalActiveLeads) },
            { type: "text", text: String(actions.length) },
          ],
        },
      ],
      partnerId,
    },
    { token, partnerId },
  )

  return briefing
}

export async function getTodayBriefing(partnerId: string): Promise<Briefing | null> {
  await connectDb()
  const date = todayIsoDate()
  const briefing = await PartnerBriefingModel.findOne({ partnerId, date }).lean().exec()
  if (!briefing) {
    return null
  }
  return {
    partnerId: briefing.partnerId,
    date: briefing.date,
    whatsappSummary: briefing.whatsappSummary,
    inAppSections: briefing.inAppSections,
  }
}
