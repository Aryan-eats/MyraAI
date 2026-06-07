import connectDb from "@/lib/db"
import { chunkText } from "@/lib/chunker"
import { embedChunks } from "@/lib/embeddings"
import KnowledgeChunk from "@/model/KnowledgeChunk"
import KnowledgeSource from "@/model/KnowledgeSource"

/**
 * Full ingestion pipeline: chunk -> embed -> store.
 * Updates KnowledgeSource status throughout the process.
 */
export async function ingestSource(sourceId: string): Promise<void> {
  try {
    await connectDb()

    const source = await KnowledgeSource.findById(sourceId)
    if (!source) {
      throw new Error(`KnowledgeSource not found: ${sourceId}`)
    }

    await KnowledgeSource.findByIdAndUpdate(sourceId, { status: "processing" })

    const chunks = chunkText(source.originalContent)
    const embeddings = await embedChunks(chunks)

    await KnowledgeChunk.deleteMany({ sourceId, botId: source.botId })

    const chunkDocs = chunks.map((content, index) => ({
      botId: source.botId,
      sourceId: source._id.toString(),
      content,
      embedding: embeddings[index] ?? [],
      metadata: {
        sourceType: source.type,
        sourceName: source.name,
        chunkIndex: index,
      },
    }))

    if (chunkDocs.length > 0) {
      await KnowledgeChunk.insertMany(chunkDocs)
    }

    await KnowledgeSource.findByIdAndUpdate(sourceId, {
      status: "ready",
      chunkCount: chunkDocs.length,
      errorMessage: undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingestion error"

    await KnowledgeSource.findByIdAndUpdate(sourceId, {
      status: "failed",
      errorMessage: message,
    })

    throw new Error(message)
  }
}
