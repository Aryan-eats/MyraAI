import mongoose, { Document, Schema, Types } from "mongoose"

export interface IBot extends Document {
  _id: Types.ObjectId
  ownerId: string
  name: string
  slug: string
  systemPrompt: string
  primaryColor: string
  welcomeMessage: string
  fallbackMessage: string
  allowedDomains: string[]
  status: "active" | "inactive"
  createdAt: Date
  updatedAt: Date
}

const BotSchema = new Schema<IBot>(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    systemPrompt: {
      type: String,
      default: "You are a helpful customer support assistant.",
    },
    primaryColor: { type: String, default: "#6366f1" },
    welcomeMessage: { type: String, default: "Hi! How can I help you today?" },
    fallbackMessage: {
      type: String,
      default: "I'm not sure about that. Please contact our support team.",
    },
    allowedDomains: { type: [String], default: [] },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
)

const Bot = mongoose.models.Bot || mongoose.model<IBot>("Bot", BotSchema)

export default Bot
