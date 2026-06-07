import mongoose, { Document, Schema, Types } from "mongoose"

export interface IKnowledgeChunk extends Document {
  _id: Types.ObjectId
  botId: string
  sourceId: string
  content: string
  embedding: number[]
  metadata: {
    sourceType: "text" | "file" | "url"
    sourceName: string
    chunkIndex: number
  }
  createdAt: Date
  updatedAt: Date
}

const KnowledgeChunkSchema = new Schema<IKnowledgeChunk>(
  {
    botId: { type: String, required: true, index: true },
    sourceId: { type: String, required: true, index: true },
    content: { type: String, required: true },
    embedding: { type: [Number], required: true },
    metadata: {
      sourceType: { type: String, enum: ["text", "file", "url"], required: true },
      sourceName: { type: String, required: true },
      chunkIndex: { type: Number, required: true },
    },
  },
  { timestamps: true },
)

const KnowledgeChunk =
  mongoose.models.KnowledgeChunk ||
  mongoose.model<IKnowledgeChunk>("KnowledgeChunk", KnowledgeChunkSchema)

export default KnowledgeChunk
