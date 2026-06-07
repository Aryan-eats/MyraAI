import { GoogleGenAI } from "@google/genai"

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

function getEmbeddingValues(response: { embeddings?: Array<{ values?: number[] }> }): number[] {
  const values = response.embeddings?.[0]?.values
  if (!values || values.length === 0) {
    throw new Error("Embedding response did not include vector values.")
  }
  return values
}

/**
 * Generates a 768-dimension embedding vector for a single text string.
 * Model: text-embedding-004
 */
export async function embedText(text: string): Promise<number[]> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is missing.")
    }

    const response = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: text,
      config: {
        outputDimensionality: 768,
      },
    })

    return getEmbeddingValues(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate embedding"
    throw new Error(message)
  }
}

/**
 * Embeds multiple chunks with rate-limit-safe batching.
 * Processes in batches of 5 with 200ms delay between batches.
 */
export async function embedChunks(chunks: string[]): Promise<number[][]> {
  try {
    const embeddings: number[][] = []
    const batchSize = 5

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)
      const results = await Promise.all(batch.map((chunk) => embedText(chunk)))
      embeddings.push(...results)

      if (i + batchSize < chunks.length) {
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 200)
        })
      }
    }

    return embeddings
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to embed chunks"
    throw new Error(message)
  }
}
