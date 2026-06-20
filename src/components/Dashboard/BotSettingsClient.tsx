'use client'

import { useMemo, useState } from "react"
import Link from "next/link"

type BotRecord = {
  _id: string
  name: string
  slug: string
  systemPrompt: string
  primaryColor: string
  welcomeMessage: string
  fallbackMessage: string
  allowedDomains: string[]
  status: "active" | "inactive"
}

export default function BotSettingsClient({ bot }: { bot: BotRecord }) {
  const [name, setName] = useState(bot.name)
  const [systemPrompt, setSystemPrompt] = useState(bot.systemPrompt)
  const [primaryColor, setPrimaryColor] = useState(bot.primaryColor)
  const [welcomeMessage, setWelcomeMessage] = useState(bot.welcomeMessage)
  const [fallbackMessage, setFallbackMessage] = useState(bot.fallbackMessage)
  const [allowedDomains, setAllowedDomains] = useState(bot.allowedDomains.join("\n"))
  const [status, setStatus] = useState<"active" | "inactive">(bot.status)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const embedCode = useMemo(
    () => `<script src="${appUrl}/widget.js" data-bot-id="${bot._id}"></script>`,
    [appUrl, bot._id],
  )

  const saveBot = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/bots/${bot._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          systemPrompt,
          primaryColor,
          welcomeMessage,
          fallbackMessage,
          allowedDomains: allowedDomains
            .split(/[\n,]/)
            .map((value) => value.trim())
            .filter(Boolean),
          status,
        }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(data.error || "Failed to save bot")
      }

      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
      setError(null)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save bot")
    } finally {
      setSaving(false)
    }
  }

  const copyEmbedCode = async () => {
    await navigator.clipboard.writeText(embedCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-14 space-y-8">
      <div
        className="rounded-2xl border shadow-xl p-8"
        style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Bot settings</p>
            <h1 className="text-2xl font-semibold">{bot.name}</h1>
          </div>
          <Link href={`/dashboard/bots/${bot._id}/knowledge`} className="rounded-xl border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
            Knowledge
          </Link>
        </div>

        <div className="mt-6 grid gap-4">
          <input className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} value={name} onChange={(event) => setName(event.target.value)} placeholder="Bot name" />
          <textarea className="min-h-32 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} placeholder="System prompt" />
          <div className="grid gap-4 sm:grid-cols-2">
            <input className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} placeholder="Primary color" />
            <select className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} value={status} onChange={(event) => setStatus(event.target.value as "active" | "inactive")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <input className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} value={welcomeMessage} onChange={(event) => setWelcomeMessage(event.target.value)} placeholder="Welcome message" />
          <input className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} value={fallbackMessage} onChange={(event) => setFallbackMessage(event.target.value)} placeholder="Fallback message" />
          <textarea className="min-h-24 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} value={allowedDomains} onChange={(event) => setAllowedDomains(event.target.value)} placeholder="Allowed domains" />

          <div className="flex items-center gap-3">
            <button type="button" disabled={saving} onClick={() => void saveBot()} className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {saving ? "Saving..." : "Save Changes"}
            </button>
            {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
            {error ? <span className="text-sm text-red-600">{error}</span> : null}
          </div>
        </div>
      </div>

      <div
        className="rounded-2xl border shadow-xl p-8"
        style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Get Embed Code</h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Drop this script tag into any public website.
            </p>
          </div>
          <button type="button" onClick={() => void copyEmbedCode()} className="rounded-xl border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-zinc-950 p-4 text-sm text-zinc-100">
          {embedCode}
        </pre>
      </div>
    </div>
  )
}
