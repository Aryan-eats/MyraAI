'use client'

import { AnimatePresence, motion } from "motion/react"
import axios from "axios"
import { useRouter } from "next/navigation"
import React, { useMemo, useState } from "react"
import { uiColors } from "@theme/colors"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
}

type ChatClientProps = {
  ownerId?: string
  mode: "web" | "crm"
}

function ChatClient({ ownerId = "", mode }: ChatClientProps) {
  const router = useRouter()
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text:
        mode === "crm"
          ? "I am your CRM copilot. Ask about pending documents, approval trends, commissions, or any partner case."
          : "I am Myra, GPS India's lending advisor. Ask about eligibility basics, products, rates, and loan process.",
    },
  ])
  const [lastTools, setLastTools] = useState<string[]>([])

  const conversation = useMemo(
    () => messages.map((message) => ({ role: message.role, text: message.text })),
    [messages],
  )

  const endpoint = mode === "crm" ? "/api/crm-assistant" : "/api/chat/web"
  const title = mode === "crm" ? "CRM Copilot" : "Web Lending Advisor"
  const subtitle =
    mode === "crm"
      ? "Partner operations assistant for active pipeline and follow-ups"
      : "Public assistant for borrower guidance and loan discovery"

  const starterPrompts =
    mode === "crm"
      ? ["Show clients blocked on documents", "What is hurting approval rate this month?", "Draft reminder for Neha Saini"]
      : ["Which loan options fit self-employed borrowers?", "How does FOIR affect eligibility?", "What documents are needed for a home loan?"]

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) {
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setLoading(true)

    try {
      const payload =
        mode === "crm"
          ? { message: text, conversation, sessionId: ownerId || "crm-web-session" }
          : { message: text, sessionId: ownerId || "web-session" }

      const { data } = await axios.post(endpoint, payload)

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: typeof data?.answer === "string" ? data.answer : "I could not process that right now. Please try again.",
      }
      setMessages((prev) => [...prev, assistantMessage])
      setLastTools(Array.isArray(data?.toolsUsed) ? data.toolsUsed : [])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "There was an issue reaching support services. Please try again in a moment.",
        },
      ])
      setLastTools([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      <motion.div
        initial={{ y: -50 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 left-0 w-full z-50 border-b backdrop-blur-xl"
        style={{
          backgroundColor: "color-mix(in srgb, var(--surface) 82%, transparent)",
          borderColor: "var(--border)",
        }}
      >
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <button className="text-lg font-semibold tracking-tight cursor-pointer" onClick={() => router.push("/")}>
            Myra <span className="text-zinc-400">AI</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-lg text-xs border transition"
              style={{
                borderColor: mode === "web" ? uiColors.brand : "var(--border)",
                backgroundColor: mode === "web" ? uiColors.brand : "var(--surface)",
                color: mode === "web" ? "var(--brand-contrast)" : "var(--text)",
              }}
              onClick={() => router.push("/chat?mode=web")}
            >
              Web
            </button>
            <button
              className="px-3 py-1.5 rounded-lg text-xs border transition"
              style={{
                borderColor: mode === "crm" ? uiColors.brand : "var(--border)",
                backgroundColor: mode === "crm" ? uiColors.brand : "var(--surface)",
                color: mode === "crm" ? "var(--brand-contrast)" : "var(--text)",
              }}
              onClick={() => router.push(ownerId ? `/chat?mode=crm&ownerId=${ownerId}` : "/chat?mode=crm")}
            >
              CRM
            </button>
          </div>
        </div>
      </motion.div>

      <section className="pt-28 pb-12 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border shadow-xl overflow-hidden"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <h1 className="text-xl font-semibold">{title}</h1>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {subtitle}
              </p>
              {lastTools.length > 0 ? (
                <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                  Last tools: {lastTools.join(", ")}
                </p>
              ) : null}
            </div>

            <div className="px-6 py-3 border-b flex flex-wrap gap-2" style={{ borderColor: "var(--border)" }}>
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  className="text-xs px-3 py-1.5 rounded-full border hover:bg-zinc-100 transition"
                  style={{ borderColor: "var(--border)" }}
                  onClick={() => setInput(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="h-[56vh] overflow-y-auto px-6 py-5 space-y-3" style={{ backgroundColor: "var(--surface-soft)" }}>
              <AnimatePresence initial={false}>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                      message.role === "user" ? "ml-auto bg-black text-white" : "border"
                    }`}
                    style={message.role === "assistant" ? { borderColor: "var(--border)", backgroundColor: "var(--surface)" } : undefined}
                  >
                    {message.text}
                  </motion.div>
                ))}
              </AnimatePresence>
              {loading ? (
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Myra is typing...
                </div>
              ) : null}
            </div>

            <div className="p-4 border-t flex items-center gap-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void sendMessage()
                  }
                }}
                placeholder={
                  mode === "crm"
                    ? "Ask about pending cases, commissions, reminders, and approval blockers..."
                    : "Ask about products, process, eligibility basics, and required documents..."
                }
                className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
              />
              <button
                onClick={() => void sendMessage()}
                disabled={loading}
                className="px-5 py-3 rounded-xl bg-black text-white text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-60"
              >
                Send
              </button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

export default ChatClient
