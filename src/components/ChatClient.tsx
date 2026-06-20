'use client'

import { useRouter } from "next/navigation"
import React, { useMemo, useState } from "react"
import { uiColors } from "@theme/colors"
import { FormattedChatMessage } from "@/components/FormattedChatMessage"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
}

type ChatMode = "web" | "crm" | "partner" | "admin"

type ChatClientProps = {
  ownerId?: string
  mode: ChatMode
}

const MODE_CONFIG: Record<ChatMode, { title: string; subtitle: string; endpoint: string; welcome: string; starters: string[]; needsToken: boolean }> = {
  web: {
    title: "Web Lending Advisor",
    subtitle: "Public assistant for borrower guidance and loan discovery",
    endpoint: "/api/chat/web",
    welcome: "I am Myra, GPS India's lending advisor. Ask about eligibility basics, products, rates, and loan process.",
    starters: ["Which loan options fit self-employed borrowers?", "How does FOIR affect eligibility?", "What documents are needed for a home loan?"],
    needsToken: false,
  },
  crm: {
    title: "CRM Copilot",
    subtitle: "Authenticated partner operations assistant - requires GPS JWT",
    endpoint: "/api/chat/crm",
    welcome: "I am your CRM copilot. Ask about pending documents, approval trends, commissions, or any partner case.",
    starters: ["Show clients blocked on documents", "What is hurting approval rate this month?", "Draft reminder for Neha Saini"],
    needsToken: true,
  },
  partner: {
    title: "Partner Chatbot",
    subtitle: "Authenticated partner pipeline assistant — requires GPS JWT",
    endpoint: "/api/chat/partner",
    welcome: "I am your partner pipeline assistant. Ask about your leads, missing documents, commissions, or stalled cases.",
    starters: ["How many leads do I have?", "Which leads have missing documents?", "What are my commissions this month?"],
    needsToken: true,
  },
  admin: {
    title: "Admin Chatbot",
    subtitle: "Platform-wide analytics assistant — requires admin JWT",
    endpoint: "/api/chat/admin",
    welcome: "I am Myra, GPS India's internal operations assistant. Ask about platform-wide lead data, partner performance, or bank statistics.",
    starters: ["How many total leads on the platform?", "Who are the top performing partners?", "Which bank has the highest approval rate?"],
    needsToken: true,
  },
}

function ChatClient({ ownerId = "", mode }: ChatClientProps) {
  const router = useRouter()
  const config = MODE_CONFIG[mode]
  const [sessionId] = useState(() => ownerId || crypto.randomUUID())
  const [input, setInput] = useState("")
  const [token, setToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: config.welcome },
  ])
  const [lastTools, setLastTools] = useState<string[]>([])

  const conversation = useMemo(
    () => messages.map((message) => ({ role: message.role, text: message.text })),
    [messages],
  )

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setLoading(true)

    try {
      const payload =
        mode === "crm"
          ? { message: text, conversation, sessionId }
          : { message: text, sessionId }

      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(String(data?.message || data?.error || "Chat request failed"))
      }

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
      <div
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
          <div className="flex items-center gap-2 flex-wrap">
            {(["web", "crm", "partner", "admin"] as ChatMode[]).map((m) => (
              <button
                key={m}
                className="px-3 py-1.5 rounded-lg text-xs border transition capitalize"
                style={{
                  borderColor: mode === m ? uiColors.brand : "var(--border)",
                  backgroundColor: mode === m ? uiColors.brand : "var(--surface)",
                  color: mode === m ? "var(--brand-contrast)" : "var(--text)",
                }}
                onClick={() => router.push(ownerId ? `/chat?mode=${m}&ownerId=${ownerId}` : `/chat?mode=${m}`)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="pt-28 pb-12 px-4">
        <div className="max-w-5xl mx-auto">
          <div
            className="rounded-2xl border shadow-xl overflow-hidden"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <h1 className="text-xl font-semibold">{config.title}</h1>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {config.subtitle}
              </p>
              {lastTools.length > 0 ? (
                <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                  Last tools: {lastTools.join(", ")}
                </p>
              ) : null}
            </div>

            {config.needsToken ? (
              <div className="px-6 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste GPS JWT token to authenticate..."
                  className="w-full rounded-lg border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-black/80"
                  style={{ borderColor: token ? "var(--border)" : "#f87171", backgroundColor: "var(--surface)" }}
                />
                {!token ? (
                  <p className="mt-1 text-xs text-red-500">A valid partner/admin JWT is required for this mode.</p>
                ) : null}
              </div>
            ) : null}

            <div className="px-6 py-3 border-b flex flex-wrap gap-2" style={{ borderColor: "var(--border)" }}>
              {config.starters.map((prompt) => (
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
              
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                      message.role === "user" ? "ml-auto bg-black text-white" : "border"
                    }`}
                    style={message.role === "assistant" ? { borderColor: "var(--border)", backgroundColor: "var(--surface)" } : undefined}
                  >
                    <FormattedChatMessage text={message.text} />
                  </div>
                ))}
              
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
          </div>
        </div>
      </section>
    </div>
  )
}

export default ChatClient
