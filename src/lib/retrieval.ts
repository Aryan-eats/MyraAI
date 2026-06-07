import connectDb from "@/lib/db"
import { embedText } from "@/lib/embeddings"
import KnowledgeChunk from "@/model/KnowledgeChunk"

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length)
  if (length === 0) {
    return 0
  }

  let dot = 0
  let magA = 0
  let magB = 0

  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    dot += left * right
    magA += left * left
    magB += right * right
  }

  if (magA === 0 || magB === 0) {
    return 0
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

export async function retrieveRelevantChunks(
  botId: string,
  query: string,
  topK = 5,
): Promise<string[]> {
  try {
    await connectDb()

    const queryEmbedding = await embedText(query)
    const queryResult = KnowledgeChunk.find(
      { botId },
      { content: 1, embedding: 1 },
    )
    const chunks = typeof queryResult.lean === "function" ? await queryResult.lean() : await queryResult

    if (!Array.isArray(chunks)) {
      return []
    }

    const scored = chunks
      .map((chunk) => ({
        content: chunk.content,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK)

    return scored.map((chunk) => chunk.content)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve relevant chunks"
    throw new Error(message)
  }
}
