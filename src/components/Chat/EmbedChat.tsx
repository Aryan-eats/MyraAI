"use client"

import type { CSSProperties } from "react"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { FormattedChatMessage } from "@/components/FormattedChatMessage"

type BotPublicConfig = {
  name: string
  welcomeMessage: string
  primaryColor: string
}

type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

const SESSION_PREFIX = "myra:embed:session:"

function ensureSessionId(botId: string) {
  if (typeof window === "undefined") {
    return ""
  }

  const storageKey = `${SESSION_PREFIX}${botId}`
  const existing = window.sessionStorage.getItem(storageKey)
  if (existing) {
    return existing
  }

  const nextId = crypto.randomUUID()
  window.sessionStorage.setItem(storageKey, nextId)
  return nextId
}

export default function EmbedChat() {
  const searchParams = useSearchParams()
  const botId = searchParams.get("botId") ?? ""
  const [bot, setBot] = useState<BotPublicConfig | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState("")
  const [error, setError] = useState<string | null>(null)

  const accentColor = bot?.primaryColor ?? "#6366f1"
  const sessionStorageKey = useMemo(
    () => (botId ? `${SESSION_PREFIX}${botId}` : ""),
    [botId],
  )

  useEffect(() => {
    if (!botId) {
      setError("Missing botId.")
      return
    }

    const nextSessionId = ensureSessionId(botId)
    setSessionId(nextSessionId)

    let cancelled = false

    const loadBot = async () => {
      try {
        setError(null)
        const response = await fetch(`/api/bots/${botId}/public`, {
          cache: "no-store",
        })

        if (!response.ok) {
          throw new Error("Unable to load this chat widget.")
        }

        const data = (await response.json()) as BotPublicConfig
        if (cancelled) {
          return
        }

        setBot(data)
        window.parent.postMessage({ type: "myra:color", color: data.primaryColor }, "*")
        setMessages((current) =>
          current.length > 0
            ? current
            : [{ role: "assistant", content: data.welcomeMessage }],
        )
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load this chat widget.")
        }
      }
    }

    void loadBot()

    return () => {
      cancelled = true
    }
  }, [botId])

  useEffect(() => {
    if (!botId || !sessionId || !sessionStorageKey) {
      return
    }

    window.sessionStorage.setItem(sessionStorageKey, sessionId)
  }, [botId, sessionId, sessionStorageKey])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading || !botId) {
      return
    }

    const userMessage: ChatMessage = { role: "user", content: text }
    setMessages((current) => [...current, userMessage])
    setInput("")
    setLoading(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId,
          message: text,
          sessionId: sessionId || ensureSessionId(botId),
        }),
      })

      const data = (await response.json()) as { reply?: string; answer?: string; sessionId?: string; error?: string }
      if (!response.ok) {
        throw new Error(data.error || "Chat request failed.")
      }

      const reply = data.reply ?? data.answer ?? "I could not generate a response."
      if (data.sessionId) {
        setSessionId(data.sessionId)
        if (sessionStorageKey) {
          window.sessionStorage.setItem(sessionStorageKey, data.sessionId)
        }
      }

      setMessages((current) => [...current, { role: "assistant", content: reply }])
    } catch (sendError) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: sendError instanceof Error ? sendError.message : "Chat request failed.",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const closeWidget = () => {
    window.parent.postMessage({ type: "myra:close" }, "*")
  }

  if (!botId) {
    return (
      <div className="flex h-screen items-center justify-center bg-white text-sm text-zinc-600">
        Missing botId.
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-white text-zinc-900">
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "color-mix(in srgb, var(--accent, #6366f1) 20%, #e4e4e7)" }}
      >
        <div>
          <div className="text-sm font-semibold">{bot?.name ?? "Loading..."}</div>
          <div className="text-xs text-zinc-500">AI assistant</div>
        </div>
        <button
          type="button"
          onClick={closeWidget}
          className="rounded-full px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
          aria-label="Close chat"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-zinc-50 px-4 py-4">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                message.role === "user"
                  ? "ml-auto text-white"
                  : "border border-zinc-200 bg-white text-zinc-800"
              }`}
              style={message.role === "user" ? { backgroundColor: accentColor } : undefined}
            >
              <FormattedChatMessage text={message.content} />
            </div>
          ))}
          {loading ? (
            <div className="text-xs text-zinc-500">Typing...</div>
          ) : null}
        </div>
      </div>

      <div className="border-t bg-white p-3" style={{ borderColor: "rgba(228, 228, 231, 0.8)" }}>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void sendMessage()
              }
            }}
            placeholder="Ask a question..."
            rows={2}
            className="max-h-28 flex-1 resize-none rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2"
            style={{ "--tw-ring-color": accentColor } as CSSProperties}
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={loading}
            className="rounded-2xl px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60"
            style={{ backgroundColor: accentColor }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
