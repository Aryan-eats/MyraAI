import mongoose, { model, Schema } from "mongoose"

type EscalationMessage = {
  role: "user" | "assistant"
  text: string
  createdAt: Date
}

interface IEscalation {
  userId: string
  userRole: string
  reason: string
  summary: string
  intent: string
  confidence: number
  messages: EscalationMessage[]
}

const escalationSchema = new Schema<IEscalation>(
  {
    userId: { type: String, required: true },
    userRole: { type: String, required: true },
    reason: { type: String, required: true },
    summary: { type: String, required: true },
    intent: { type: String, required: true },
    confidence: { type: Number, required: true },
    messages: [
      {
        role: { type: String, enum: ["user", "assistant"], required: true },
        text: { type: String, required: true },
        createdAt: { type: Date, required: true, default: Date.now },
      },
    ],
  },
  { timestamps: true, collection: "escalations" },
)

const Escalation = mongoose.models.Escalation || model("Escalation", escalationSchema)
export default Escalation

