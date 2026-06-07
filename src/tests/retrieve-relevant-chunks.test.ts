import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/embeddings", () => ({
  embedText: vi.fn().mockResolvedValue([1, 0]),
}))

vi.mock("@/model/KnowledgeChunk", () => ({
  default: {
    find: vi.fn(),
  },
}))

import KnowledgeChunk from "@/model/KnowledgeChunk"
import { embedText } from "@/lib/embeddings"
import { retrieveRelevantChunks } from "@/lib/retrieval"

describe("retrieveRelevantChunks", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(embedText).mockResolvedValue([1, 0])
  })

  it("returns the most relevant chunks for the requested bot", async () => {
    vi.mocked(KnowledgeChunk.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { content: "exact match", embedding: [1, 0] },
        { content: "opposite match", embedding: [0, 1] },
      ]),
    } as never)

    const result = await retrieveRelevantChunks("bot_123", "hello world", 1)

    expect(KnowledgeChunk.find).toHaveBeenCalledWith(
      { botId: "bot_123" },
      { content: 1, embedding: 1 },
    )
    expect(result).toEqual(["exact match"])
  })
})
