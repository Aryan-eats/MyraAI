import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectDb from "@/lib/db"
import KnowledgeChunk from "@/model/KnowledgeChunk"
import KnowledgeSource from "@/model/KnowledgeSource"
import { ingestSource } from "@/lib/ingest"

const deleteSchema = z.object({
  sourceId: z.string().min(1, "sourceId is required"),
})

const retrySchema = z.object({
  sourceId: z.string().min(1, "sourceId is required"),
})

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  try {
    await connectDb()
    const { botId } = await params
    const sources = await KnowledgeSource.find(
      { botId },
      { originalContent: 0 },
    )
      .sort({ createdAt: -1 })
      .lean()

    return NextResponse.json({ sources })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch knowledge"
    return errorResponse(message, "FETCH_ERROR", 500)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  try {
    await connectDb()
    const { botId } = await params

    const body = retrySchema.parse(await req.json())
    const source = await KnowledgeSource.findOne({ _id: body.sourceId, botId })

    if (!source) {
      return errorResponse("Knowledge source not found", "NOT_FOUND", 404)
    }

    await KnowledgeSource.findByIdAndUpdate(body.sourceId, {
      status: "pending",
      errorMessage: undefined,
    })

    void ingestSource(body.sourceId)

    return NextResponse.json({ sourceId: body.sourceId, status: "processing" }, { status: 202 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400)
    }
    const message = error instanceof Error ? error.message : "Failed to retry ingestion"
    return errorResponse(message, "RETRY_ERROR", 500)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  try {
    await connectDb()
    const { botId } = await params

    const body = deleteSchema.parse(await req.json())
    const source = await KnowledgeSource.findOneAndDelete({
      _id: body.sourceId,
      botId,
    })

    if (!source) {
      return errorResponse("Knowledge source not found", "NOT_FOUND", 404)
    }

    await KnowledgeChunk.deleteMany({
      sourceId: body.sourceId,
      botId,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400)
    }
    const message = error instanceof Error ? error.message : "Failed to delete"
    return errorResponse(message, "DELETE_ERROR", 500)
  }
}
