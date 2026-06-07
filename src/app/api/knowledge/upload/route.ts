import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectDb from "@/lib/db"
import { ingestSource } from "@/lib/ingest"
import { parseFile } from "@/lib/parsers"
import KnowledgeSource from "@/model/KnowledgeSource"

export const runtime = "nodejs"

const formSchema = z.object({
  botId: z.string().min(1, "botId is required"),
})

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

export async function POST(req: NextRequest) {
  try {
    await connectDb()

    const formData = await req.formData()
    const validation = formSchema.safeParse({
      botId: formData.get("botId"),
    })

    if (!validation.success) {
      return errorResponse(
        validation.error.issues[0]?.message ?? "botId is required",
        "VALIDATION_ERROR",
        400,
      )
    }

    const fileValue = formData.get("file")
    if (!(fileValue instanceof File)) {
      return errorResponse("file is required", "VALIDATION_ERROR", 400)
    }

    const buffer = Buffer.from(await fileValue.arrayBuffer())
    const { text, name } = await parseFile(buffer, fileValue.name)

    const source = await KnowledgeSource.create({
      botId: validation.data.botId,
      type: "file",
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
    const message = error instanceof Error ? error.message : "Upload failed"
    return errorResponse(message, "UPLOAD_ERROR", 500)
  }
}
