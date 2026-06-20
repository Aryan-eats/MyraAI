'use client'

import { useEffect, useState } from "react"
import Link from "next/link"

type BotRecord = {
  _id: string
  name: string
  slug: string
  status: "active" | "inactive"
  createdAt: string
}

const initialForm = {
  name: "",
  systemPrompt: "You are a helpful customer support assistant.",
  primaryColor: "#6366f1",
  welcomeMessage: "Hi! How can I help you today?",
  fallbackMessage: "I'm not sure about that. Please contact our support team.",
  allowedDomains: "",
}

export default function BotsManager() {
  const [bots, setBots] = useState<BotRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState(initialForm)

  const loadBots = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/bots", { cache: "no-store" })
      const data = (await response.json()) as { bots?: BotRecord[]; error?: string }
      if (!response.ok) {
        throw new Error(data.error || "Failed to load bots")
      }
      setBots(data.bots ?? [])
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load bots")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBots()
  }, [])

  const createBot = async () => {
    if (!form.name.trim()) {
      setError("Bot name is required.")
      return
    }

    setSaving(true)
    try {
      const response = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          allowedDomains: form.allowedDomains
            .split(/[\n,]/)
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      })
      const data = (await response.json()) as { bot?: BotRecord; error?: string }
      if (!response.ok) {
        throw new Error(data.error || "Failed to create bot")
      }

      setBots((current) => [data.bot as BotRecord, ...current])
      setForm(initialForm)
      setShowForm(false)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create bot")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-14">
      <div
        className="rounded-2xl border shadow-xl p-8"
        style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Bots</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Create and manage tenant-aware support bots.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
          >
            {showForm ? "Close" : "Create Bot"}
          </button>
        </div>

        {showForm ? (
          <div className="mt-6 grid gap-4 rounded-2xl border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-soft)" }}>
            <input className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="Bot name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            <textarea className="min-h-28 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="System prompt" value={form.systemPrompt} onChange={(event) => setForm((current) => ({ ...current, systemPrompt: event.target.value }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <input className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="Primary color" value={form.primaryColor} onChange={(event) => setForm((current) => ({ ...current, primaryColor: event.target.value }))} />
              <input className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="Welcome message" value={form.welcomeMessage} onChange={(event) => setForm((current) => ({ ...current, welcomeMessage: event.target.value }))} />
            </div>
            <input className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="Fallback message" value={form.fallbackMessage} onChange={(event) => setForm((current) => ({ ...current, fallbackMessage: event.target.value }))} />
            <textarea className="min-h-24 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="Allowed domains, one per line or comma separated" value={form.allowedDomains} onChange={(event) => setForm((current) => ({ ...current, allowedDomains: event.target.value }))} />
            <div className="flex items-center gap-3">
              <button type="button" disabled={saving} onClick={() => void createBot()} className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {saving ? "Saving..." : "Save Bot"}
              </button>
              {saved ? <span className="text-sm text-emerald-600">Bot created</span> : null}
              {error ? <span className="text-sm text-red-600">{error}</span> : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading bots...</div>
        ) : (
          <div className="grid gap-4">
            {bots.map((bot) => (
              <div
                key={bot._id}
                className="rounded-2xl border p-5"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold">{bot.name}</h2>
                      <span className="rounded-full border px-2 py-0.5 text-xs capitalize" style={{ borderColor: "var(--border)" }}>
                        {bot.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">Slug: {bot.slug}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link href={`/dashboard/bots/${bot._id}`} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                      Settings
                    </Link>
                    <Link href={`/dashboard/bots/${bot._id}/knowledge`} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                      Knowledge
                    </Link>
                  </div>
                </div>
              </div>
            ))}
            {bots.length === 0 ? <div className="text-sm text-zinc-500">No bots yet.</div> : null}
          </div>
        )}
      </div>
    </div>
  )
}
