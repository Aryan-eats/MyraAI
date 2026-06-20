'use client'

import { useMemo, useState } from "react"
import Link from "next/link"

type BotRecord = {
  _id: string
  name: string
  slug: string
}

export default function OnboardingClient() {
  const [bots, setBots] = useState<BotRecord[]>([])
  const [name, setName] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful customer support assistant.")
  const [primaryColor, setPrimaryColor] = useState("#6366f1")
  const [welcomeMessage, setWelcomeMessage] = useState("Hi! How can I help you today?")
  const [fallbackMessage, setFallbackMessage] = useState("I'm not sure about that. Please contact our support team.")
  const [allowedDomains, setAllowedDomains] = useState("")
  const [saving, setSaving] = useState(false)
  const [botId, setBotId] = useState("")
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [knowledgeName, setKnowledgeName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const currentBot = bots[0] ?? null
  const embedCode = useMemo(() => {
    if (!botId) return ""
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    return `<script src="${appUrl}/widget.js" data-bot-id="${botId}"></script>`
  }, [botId])

  const createBot = async () => {
    if (!name.trim()) {
      setError("Bot name is required.")
      return
    }

    setSaving(true)
    try {
      const response = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          systemPrompt,
          primaryColor,
          welcomeMessage,
          fallbackMessage,
          allowedDomains: allowedDomains
            .split(/[\n,]/)
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      })
      const data = (await response.json()) as { bot?: BotRecord; error?: string }
      if (!response.ok) {
        throw new Error(data.error || "Failed to create bot")
      }

      const nextBot = data.bot as BotRecord
      setBots([nextBot])
      setBotId(nextBot._id)
      setMessage("Bot created. Continue with your first knowledge source.")
      setError(null)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create bot")
    } finally {
      setSaving(false)
    }
  }

  const addTextKnowledge = async () => {
    if (!botId || !text.trim()) {
      setError("Add text before saving.")
      return
    }

    setSaving(true)
    try {
      const response = await fetch("/api/knowledge/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId,
          type: "text",
          content: text,
          name: knowledgeName || undefined,
        }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(data.error || "Failed to save knowledge")
      }
      setText("")
      setKnowledgeName("")
      setMessage("Knowledge source queued for ingestion.")
      setError(null)
    } catch (knowledgeError) {
      setError(knowledgeError instanceof Error ? knowledgeError.message : "Failed to save knowledge")
    } finally {
      setSaving(false)
    }
  }

  const addFileKnowledge = async () => {
    if (!botId || !file) {
      setError("Choose a file first.")
      return
    }

    setSaving(true)
    try {
      const formData = new FormData()
      formData.set("botId", botId)
      formData.set("file", file)
      const response = await fetch("/api/knowledge/upload", {
        method: "POST",
        body: formData,
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(data.error || "Failed to upload file")
      }
      setFile(null)
      setMessage("File queued for ingestion.")
      setError(null)
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Failed to upload file")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen px-4 py-14">
      <div className="mx-auto max-w-5xl space-y-8">
        <section
          className="rounded-2xl border bg-white p-8 shadow-xl"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Onboarding</p>
          <h1 className="mt-2 text-2xl font-semibold">Set up your first bot</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Create a bot, add knowledge, then copy the embed code.
          </p>
        </section>

        <div className="grid gap-6">
          <section className="rounded-2xl border bg-white p-6 shadow-lg" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-lg font-semibold">1. Name your bot</h2>
            <div className="mt-4 grid gap-3">
              <input className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="Bot name" value={name} onChange={(event) => setName(event.target.value)} />
              <textarea className="min-h-28 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="System prompt" value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="Primary color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} />
                <input className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="Welcome message" value={welcomeMessage} onChange={(event) => setWelcomeMessage(event.target.value)} />
              </div>
              <input className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="Fallback message" value={fallbackMessage} onChange={(event) => setFallbackMessage(event.target.value)} />
              <textarea className="min-h-24 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="Allowed domains" value={allowedDomains} onChange={(event) => setAllowedDomains(event.target.value)} />
              <button type="button" disabled={saving} onClick={() => void createBot()} className="w-fit rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {saving ? "Saving..." : "Create Bot"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-lg" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-lg font-semibold">2. Add your first knowledge source</h2>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="Optional source name" value={knowledgeName} onChange={(event) => setKnowledgeName(event.target.value)} />
                <input type="file" accept=".txt,.pdf,.md,.csv,.docx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              </div>
              <textarea className="min-h-32 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="Paste raw text here" value={text} onChange={(event) => setText(event.target.value)} />
              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={saving || !file} onClick={() => void addFileKnowledge()} className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                  Upload File
                </button>
                <button type="button" disabled={saving || !text.trim()} onClick={() => void addTextKnowledge()} className="rounded-xl border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                  Save Text
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-lg" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-lg font-semibold">3. Get your embed code</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Once the bot exists, paste this into any public website.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-zinc-950 p-4 text-sm text-zinc-100">
              {embedCode || "Create a bot first to generate code."}
            </pre>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={!embedCode}
                onClick={() => navigator.clipboard.writeText(embedCode)}
                className="rounded-xl border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Copy Code
              </button>
              <Link href="/dashboard/bots" className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white">
                Go to Bots
              </Link>
            </div>
          </section>
        </div>

        {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {currentBot ? <p className="text-sm text-zinc-500">Current bot: {currentBot.name}</p> : null}
      </div>
    </main>
  )
}
