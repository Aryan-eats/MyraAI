'use client'

import { useEffect, useMemo, useState } from "react"

type KnowledgeSource = {
  _id: string
  name: string
  type: "text" | "file" | "url"
  status: "pending" | "processing" | "ready" | "failed"
  chunkCount: number
  errorMessage?: string
  createdAt: string
}

function isProcessing(sources: KnowledgeSource[]) {
  return sources.some((source) => source.status === "processing")
}

export default function BotKnowledgeClient({ botId, botName }: { botId: string; botName: string }) {
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState("")
  const [textName, setTextName] = useState("")
  const [url, setUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const hasProcessing = useMemo(() => isProcessing(sources), [sources])

  const loadSources = async () => {
    try {
      const response = await fetch(`/api/knowledge/${botId}`, { cache: "no-store" })
      const data = (await response.json()) as { sources?: KnowledgeSource[]; error?: string }
      if (!response.ok) {
        throw new Error(data.error || "Failed to load knowledge sources")
      }
      setSources(data.sources ?? [])
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load knowledge sources")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSources()
  }, [botId])

  useEffect(() => {
    if (!hasProcessing) {
      return
    }
    const interval = window.setInterval(() => {
      void loadSources()
    }, 3000)
    return () => window.clearInterval(interval)
  }, [hasProcessing])

  const refreshNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 2500)
  }

  const submitFile = async () => {
    if (!file) {
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
        throw new Error(data.error || "Upload failed")
      }
      setFile(null)
      refreshNotice("File queued for ingestion.")
      await loadSources()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed")
    } finally {
      setSaving(false)
    }
  }

  const submitText = async (kind: "text" | "url") => {
    const content = kind === "text" ? text.trim() : url.trim()
    if (!content) {
      setError(kind === "text" ? "Add some text first." : "Add a valid URL first.")
      return
    }

    setSaving(true)
    try {
      const response = await fetch("/api/knowledge/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId,
          type: kind,
          content,
          name: kind === "text" ? textName || undefined : undefined,
        }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(data.error || "Failed to save knowledge")
      }

      if (kind === "text") {
        setText("")
        setTextName("")
      } else {
        setUrl("")
      }
      refreshNotice("Knowledge source queued.")
      await loadSources()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save knowledge")
    } finally {
      setSaving(false)
    }
  }

  const retrySource = async (sourceId: string) => {
    setSaving(true)
    try {
      const response = await fetch(`/api/knowledge/${botId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(data.error || "Retry failed")
      }
      refreshNotice("Re-ingestion queued.")
      await loadSources()
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Retry failed")
    } finally {
      setSaving(false)
    }
  }

  const deleteSource = async (sourceId: string) => {
    setSaving(true)
    try {
      const response = await fetch(`/api/knowledge/${botId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete source")
      }

      refreshNotice("Knowledge source deleted.")
      await loadSources()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete source")
    } finally {
      setSaving(false)
    }
  }

  const statusBadge = (status: KnowledgeSource["status"]) => {
    if (status === "processing") return "rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800"
    if (status === "ready") return "rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800"
    if (status === "failed") return "rounded-full bg-red-100 px-2 py-1 text-xs text-red-800"
    return "rounded-full bg-zinc-200 px-2 py-1 text-xs text-zinc-700"
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-14 space-y-8">
      <div
        className="rounded-2xl border shadow-xl p-8"
        style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
      >
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Knowledge</p>
        <h1 className="text-2xl font-semibold">{botName}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Upload files, add text, or ingest URLs. Processing sources will poll until ready.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border p-6" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="text-lg font-semibold">Upload File</h2>
          <input className="mt-4 block w-full text-sm" type="file" accept=".txt,.pdf,.md,.csv,.docx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          <button type="button" disabled={saving} onClick={() => void submitFile()} className="mt-4 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {saving ? "Uploading..." : "Upload and Process"}
          </button>
        </div>

        <div className="rounded-2xl border p-6" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="text-lg font-semibold">Add Text</h2>
          <input className="mt-4 w-full rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="Optional name" value={textName} onChange={(event) => setTextName(event.target.value)} />
          <textarea className="mt-3 min-h-40 w-full rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="Paste raw text here" value={text} onChange={(event) => setText(event.target.value)} />
          <button type="button" disabled={saving} onClick={() => void submitText("text")} className="mt-4 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            Save Text
          </button>
        </div>

        <div className="rounded-2xl border p-6 lg:col-span-2" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="text-lg font-semibold">Add URL</h2>
          <div className="mt-4 flex gap-3">
            <input className="w-full rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }} placeholder="https://example.com/help" value={url} onChange={(event) => setUrl(event.target.value)} />
            <button type="button" disabled={saving} onClick={() => void submitText("url")} className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              Save URL
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border p-6" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Knowledge Sources</h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {hasProcessing ? "Polling for status updates..." : "Current ingested sources."}
            </p>
          </div>
          {loading ? <span className="text-sm text-zinc-500">Loading...</span> : null}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Chunks</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source._id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-3 pr-4">
                    <div>{source.name}</div>
                    {source.status === "failed" && source.errorMessage ? (
                      <div className="mt-1 text-xs text-red-500" title={source.errorMessage}>
                        {source.errorMessage.length > 60 ? `${source.errorMessage.slice(0, 60)}…` : source.errorMessage}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 capitalize">{source.type}</td>
                  <td className="py-3 pr-4">
                    <span className={statusBadge(source.status)}>{source.status}</span>
                  </td>
                  <td className="py-3 pr-4">{source.chunkCount}</td>
                  <td className="py-3 pr-4">{new Date(source.createdAt).toLocaleString()}</td>
                  <td className="py-3 pr-4 flex gap-2">
                    {source.status === "failed" ? (
                      <button type="button" disabled={saving} onClick={() => void retrySource(source._id)} className="rounded-xl border px-3 py-2 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 transition" >
                        Retry
                      </button>
                    ) : null}
                    <button type="button" disabled={saving} onClick={() => void deleteSource(source._id)} className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--border)" }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {sources.length === 0 ? (
                <tr>
                  <td className="py-4 text-sm text-zinc-500" colSpan={6}>
                    No sources yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {notice ? <div className="text-sm text-emerald-600">{notice}</div> : null}
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
    </div>
  )
}
