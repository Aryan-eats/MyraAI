import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectDb from "@/lib/db"
import { ingestSource } from "@/lib/ingest"
import { parseUrl } from "@/lib/parsers"
import KnowledgeSource from "@/model/KnowledgeSource"

export const runtime = "nodejs"

const textSourceSchema = z.discriminatedUnion("type", [
  z.object({
    botId: z.string().min(1, "botId is required"),
    type: z.literal("text"),
    content: z.string().min(10, "content must be at least 10 characters"),
    name: z.string().optional(),
  }),
  z.object({
    botId: z.string().min(1, "botId is required"),
    type: z.literal("url"),
    content: z.string().url("content must be a valid URL"),
    name: z.string().optional(),
  }),
])

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

export async function POST(req: NextRequest) {
  try {
    await connectDb()
    const body = textSourceSchema.parse(await req.json())

    let text = body.content
    let name = body.name ?? "Manual Text"

    if (body.type === "url") {
      const parsed = await parseUrl(body.content)
      text = parsed.text
      name = body.name ?? parsed.name
    }

    const source = await KnowledgeSource.create({
      botId: body.botId,
      type: body.type,
      name,
      originalContent: text,
      status: "pending",
      chunkCount: 0,
    })

    void ingestSource(source._id.toString()).catch((error: unknown) => {
      console.error("knowledge ingestion failed", error)
    })

    return NextResponse.json(
      { sourceId: source._id.toString(), status: "processing" },
      { status: 202 },
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400)
    }
    const message = error instanceof Error ? error.message : "Failed"
    return errorResponse(message, "INGEST_ERROR", 500)
  }
}
