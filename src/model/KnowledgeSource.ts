import mongoose, { Document, Schema, Types } from "mongoose"

export interface IKnowledgeSource extends Document {
  _id: Types.ObjectId
  botId: string
  type: "text" | "file" | "url"
  name: string
  originalContent: string
  status: "pending" | "processing" | "ready" | "failed"
  chunkCount: number
  errorMessage?: string
  createdAt: Date
  updatedAt: Date
}

const KnowledgeSourceSchema = new Schema<IKnowledgeSource>(
  {
    botId: { type: String, required: true, index: true },
    type: { type: String, enum: ["text", "file", "url"], required: true },
    name: { type: String, required: true },
    originalContent: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "processing", "ready", "failed"],
      default: "pending",
    },
    chunkCount: { type: Number, default: 0 },
    errorMessage: { type: String },
  },
  { timestamps: true },
)

const KnowledgeSource =
  mongoose.models.KnowledgeSource ||
  mongoose.model<IKnowledgeSource>("KnowledgeSource", KnowledgeSourceSchema)

export default KnowledgeSource
