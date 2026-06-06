import mongoose, { model, Schema } from "mongoose"

interface IKnowledgeDocument {
  title: string
  content: string
  audiences: string[]
  tags: string[]
  active: boolean
}

const knowledgeSchema = new Schema<IKnowledgeDocument>(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    audiences: { type: [String], default: ["all"] },
    tags: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "knowledge_documents" },
)

const KnowledgeDocument =
  mongoose.models.KnowledgeDocument || model("KnowledgeDocument", knowledgeSchema)

export default KnowledgeDocument

