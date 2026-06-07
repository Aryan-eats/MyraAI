/**
 * Splits text into overlapping chunks for embedding.
 * - chunkSize: max characters per chunk (default 500)
 * - overlap: characters shared between adjacent chunks (default 50)
 */
export function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  try {
    const normalized = text.replace(/\s+/g, " ").trim()
    if (!normalized) {
      return []
    }

    const chunks: string[] = []
    const step = Math.max(1, chunkSize - overlap)

    let start = 0
    while (start < normalized.length) {
      const end = Math.min(start + chunkSize, normalized.length)
      const chunk = normalized.slice(start, end).trim()
      if (chunk.length > 20) {
        chunks.push(chunk)
      }
      start += step
    }

    return chunks
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to chunk text"
    throw new Error(message)
  }
}
