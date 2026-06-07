import mongoose, { Document, Schema, Types } from "mongoose"

export interface IChatMessage {
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

export interface IChatSession extends Document {
  _id: Types.ObjectId
  botId: string
  sessionId: string
  visitorId: string
  messages: IChatMessage[]
  createdAt: Date
  updatedAt: Date
}

const ChatSessionSchema = new Schema<IChatSession>(
  {
    botId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, unique: true, index: true },
    visitorId: { type: String, required: true },
    messages: [
      {
        role: { type: String, enum: ["user", "assistant"], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
)

const ChatSession =
  mongoose.models.ChatSession || mongoose.model<IChatSession>("ChatSession", ChatSessionSchema)

export default ChatSession
