import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectDb from "@/lib/db"
import { getSession } from "@/lib/getSession"
import Bot from "@/model/Bot"

const createBotSchema = z.object({
  name: z.string().min(1).max(80),
  systemPrompt: z.string().min(1).max(4000).optional(),
  primaryColor: z.string().min(4).max(32).optional(),
  welcomeMessage: z.string().min(1).max(500).optional(),
  fallbackMessage: z.string().min(1).max(500).optional(),
  allowedDomains: z.array(z.string().min(1)).optional(),
  status: z.enum(["active", "inactive"]).optional(),
})

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

async function buildUniqueSlug(name: string) {
  const baseSlug = slugify(name) || "bot"
  const matchingBots = await Bot.find({ slug: new RegExp(`^${baseSlug}(?:-\\d+)?$`) }).lean()
  const existingSlugs = new Set(matchingBots.map((bot) => String(bot.slug)))

  if (!existingSlugs.has(baseSlug)) {
    return baseSlug
  }

  let suffix = 2
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1
  }

  return `${baseSlug}-${suffix}`
}

export async function GET() {
  try {
    const session = await getSession()
    const ownerId = session?.user?.id
    if (!ownerId) {
      return errorResponse("Owner authentication required", "UNAUTHORIZED", 401)
    }

    await connectDb()
    const bots = await Bot.find({ ownerId }).sort({ createdAt: -1 }).lean()
    return NextResponse.json({ bots })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch bots"
    return errorResponse(message, "FETCH_ERROR", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const ownerId = session?.user?.id
    if (!ownerId) {
      return errorResponse("Owner authentication required", "UNAUTHORIZED", 401)
    }

    await connectDb()
    const body = createBotSchema.parse(await req.json())
    const slug = await buildUniqueSlug(body.name)

    const bot = await Bot.create({
      ownerId,
      name: body.name,
      slug,
      systemPrompt: body.systemPrompt,
      primaryColor: body.primaryColor,
      welcomeMessage: body.welcomeMessage,
      fallbackMessage: body.fallbackMessage,
      allowedDomains: body.allowedDomains ?? [],
      status: body.status ?? "active",
    })

    return NextResponse.json({ bot }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400)
    }
    const message = error instanceof Error ? error.message : "Failed to create bot"
    return errorResponse(message, "CREATE_ERROR", 500)
  }
}
