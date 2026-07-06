'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { FormattedChatMessage } from "@/components/FormattedChatMessage"

type ChatRole = "user" | "assistant"
type ChatMode = "web" | "crm" | "partner" | "admin"

type ChatMessage = {
  id: string
  role: ChatRole
  text: string
}

type StoredSession = {
  id: string
  title: string
  mode: ChatMode
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

type ChatWorkspaceProps = {
  email?: string
  ownerId?: string
  defaultMode?: ChatMode
}

const STORAGE_KEY = "myra.chat.sessions.v1"
const THEME_KEY = "myra.theme"

const MODE_CONFIG: Record<
  ChatMode,
  { label: string; blurb: string; endpoint: string; needsToken: boolean; starters: string[] }
> = {
  web: {
    label: "Lending Advisor",
    blurb: "Public guidance on products, eligibility, rates and process.",
    endpoint: "/api/chat/web",
    needsToken: false,
    starters: [
      "Which loan options fit a self-employed borrower?",
      "How does FOIR affect my eligibility?",
      "What documents are needed for a home loan?",
      "Compare personal loan rates across lenders",
    ],
  },
  crm: {
    label: "CRM Copilot",
    blurb: "Partner operations — pipeline, documents, commissions.",
    endpoint: "/api/chat/crm",
    needsToken: true,
    starters: [
      "Show clients blocked on documents",
      "What is hurting approval rate this month?",
      "Draft a reminder for Neha Saini",
      "Summarise my pending commissions",
    ],
  },
  partner: {
    label: "Partner Desk",
    blurb: "Your leads, missing docs, commissions and stalled cases.",
    endpoint: "/api/chat/partner",
    needsToken: true,
    starters: [
      "How many leads do I have?",
      "Which leads have missing documents?",
      "What are my commissions this month?",
      "Show my stalled cases",
    ],
  },
  admin: {
    label: "Admin Console",
    blurb: "Platform-wide analytics and partner performance.",
    endpoint: "/api/chat/admin",
    needsToken: true,
    starters: [
      "How many total leads on the platform?",
      "Who are the top performing partners?",
      "Which bank has the highest approval rate?",
      "Break down leads by status",
    ],
  },
}

/* ----------------------------- icons ----------------------------- */
type IconProps = { className?: string }
const Icon = ({ path, className = "h-4 w-4" }: IconProps & { path: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className}>
    {path}
  </svg>
)
const PlusIcon = (p: IconProps) => <Icon {...p} path={<><path d="M12 5v14" /><path d="M5 12h14" /></>} />
const SendIcon = (p: IconProps) => <Icon {...p} path={<><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>} />
const MenuIcon = (p: IconProps) => <Icon {...p} path={<><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>} />
const TrashIcon = (p: IconProps) => <Icon {...p} path={<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></>} />
const SunIcon = (p: IconProps) => <Icon {...p} path={<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>} />
const MoonIcon = (p: IconProps) => <Icon {...p} path={<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />} />
const MessageIcon = (p: IconProps) => <Icon {...p} path={<path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" />} />

/* ----------------------------- helpers ----------------------------- */
function greeting() {
  const h = new Date().getHours()
  if (h < 5) return "Still up"
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function nameFromEmail(email: string) {
  if (!email) return ""
  const raw = email.split("@")[0].replace(/[._-]+/g, " ").trim()
  return raw ? raw.replace(/\b\w/g, (c) => c.toUpperCase()) : ""
}

function groupLabel(ts: number) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dayMs = 86_400_000
  if (ts >= startOfToday) return "Today"
  if (ts >= startOfToday - dayMs) return "Yesterday"
  if (ts >= startOfToday - 7 * dayMs) return "Previous 7 days"
  return "Older"
}

function MyraMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[10px] font-semibold"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(150deg, var(--accent), var(--accent-hover))",
        color: "var(--accent-contrast)",
        fontFamily: "var(--font-display)",
        fontSize: size * 0.5,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      M
    </span>
  )
}

/* ----------------------------- component ----------------------------- */
export default function ChatWorkspace({ email = "", defaultMode = "web" }: ChatWorkspaceProps) {
  const router = useRouter()

  const [mode, setMode] = useState<ChatMode>(defaultMode)
  const [sessions, setSessions] = useState<StoredSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [token, setToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const [accountOpen, setAccountOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)

  const config = MODE_CONFIG[mode]
  const displayName = nameFromEmail(email)

  /* hydrate from storage */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setSessions(JSON.parse(raw) as StoredSession[])
    } catch {
      /* ignore */
    }
    const storedTheme = (localStorage.getItem(THEME_KEY) as "light" | "dark" | null)
    const initial =
      storedTheme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    setTheme(initial)
    document.documentElement.setAttribute("data-theme", initial)
  }, [])

  const persist = useCallback((next: StoredSession[]) => {
    setSessions(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 60)))
    } catch {
      /* ignore quota */
    }
  }, [])

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light"
    setTheme(next)
    document.documentElement.setAttribute("data-theme", next)
    localStorage.setItem(THEME_KEY, next)
  }

  /* close account popover on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  /* autoscroll */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, loading])

  const startNewChat = useCallback(() => {
    setActiveId(null)
    setMessages([])
    setInput("")
    setSidebarOpen(false)
    setTimeout(() => inputRef.current?.focus(), 40)
  }, [])

  const openSession = (session: StoredSession) => {
    setActiveId(session.id)
    setMode(session.mode)
    setMessages(session.messages)
    setInput("")
    setSidebarOpen(false)
  }

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = sessions.filter((s) => s.id !== id)
    persist(next)
    if (id === activeId) startNewChat()
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text }
    const baseMessages = [...messages, userMessage]
    setMessages(baseMessages)
    setInput("")
    setLoading(true)

    // ensure a session exists
    let sessionId = activeId
    let workingSessions = sessions
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      const newSession: StoredSession = {
        id: sessionId,
        title: text.length > 46 ? `${text.slice(0, 46)}…` : text,
        mode,
        messages: baseMessages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      workingSessions = [newSession, ...sessions]
      setActiveId(sessionId)
      persist(workingSessions)
    }

    const conversation = baseMessages.map((m) => ({ role: m.role, text: m.text }))

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text, conversation, sessionId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(String(data?.message || data?.error || "Chat request failed"))

      const answer =
        typeof data?.answer === "string"
          ? data.answer
          : typeof data?.reply === "string"
            ? data.reply
            : "I could not process that right now. Please try again."

      const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", text: answer }
      const finalMessages = [...baseMessages, assistantMessage]
      setMessages(finalMessages)
      persist(
        workingSessions.map((s) =>
          s.id === sessionId ? { ...s, messages: finalMessages, updatedAt: Date.now() } : s,
        ),
      )
    } catch {
      const errMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: config.needsToken && !token
          ? "This workspace needs a valid GPS token. Paste your partner/admin JWT above, then try again."
          : "There was an issue reaching the service. Please try again in a moment.",
      }
      const finalMessages = [...baseMessages, errMessage]
      setMessages(finalMessages)
      persist(
        workingSessions.map((s) =>
          s.id === sessionId ? { ...s, messages: finalMessages, updatedAt: Date.now() } : s,
        ),
      )
    } finally {
      setLoading(false)
    }
  }

  const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  const grouped = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
    const buckets: Record<string, StoredSession[]> = {}
    for (const s of sorted) {
      const label = groupLabel(s.updatedAt)
      ;(buckets[label] ||= []).push(s)
    }
    return ["Today", "Yesterday", "Previous 7 days", "Older"]
      .filter((k) => buckets[k]?.length)
      .map((k) => ({ label: k, items: buckets[k] }))
  }, [sessions])

  const isEmpty = messages.length === 0

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* mobile overlay */}
      {sidebarOpen ? (
        <button
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* ------------------------- SIDEBAR ------------------------- */}
      <aside
        className={`fixed z-40 flex h-full w-[278px] flex-col border-r transition-transform duration-300 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {/* brand */}
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <MyraMark size={30} />
          <div className="leading-tight">
            <div className="text-[0.95rem] font-semibold tracking-tight">Myra AI</div>
            <div className="text-[0.68rem]" style={{ color: "var(--text-subtle)" }}>
              Lending intelligence
            </div>
          </div>
        </div>

        {/* new chat */}
        <div className="px-3">
          <button
            onClick={startNewChat}
            className="group flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <PlusIcon className="h-4 w-4" />
            New conversation
          </button>
        </div>

        {/* history */}
        <div className="scroll-thin mt-5 flex-1 overflow-y-auto px-3 pb-3">
          <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[0.66rem] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-subtle)" }}>
            <MessageIcon className="h-3.5 w-3.5" /> History
          </div>
          {grouped.length === 0 ? (
            <p className="px-2 py-3 text-[0.78rem]" style={{ color: "var(--text-subtle)" }}>
              Your conversations will appear here.
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.label} className="mb-3">
                <div className="px-2 pb-1 text-[0.64rem] font-medium uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((s) => {
                    const active = s.id === activeId
                    return (
                      <button
                        key={s.id}
                        onClick={() => openSession(s)}
                        className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.82rem] transition"
                        style={{ background: active ? "var(--surface-soft)" : "transparent", color: active ? "var(--text)" : "var(--text-muted)" }}
                      >
                        <span className="min-w-0 flex-1 truncate">{s.title}</span>
                        <span
                          onClick={(e) => deleteSession(s.id, e)}
                          className="opacity-0 transition group-hover:opacity-100"
                          style={{ color: "var(--text-subtle)" }}
                          role="button"
                          aria-label="Delete conversation"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* account footer */}
        <div className="relative border-t p-3" style={{ borderColor: "var(--border)" }} ref={accountRef}>
          {accountOpen ? (
            <div
              className="absolute bottom-[68px] left-3 right-3 overflow-hidden rounded-xl border shadow-lg"
              style={{ background: "var(--surface-elev)", borderColor: "var(--border)" }}
            >
              <button
                className="w-full px-4 py-2.5 text-left text-sm transition hover:opacity-80"
                style={{ color: "var(--text)" }}
                onClick={() => router.push("/dashboard")}
              >
                Dashboard
              </button>
              {email ? (
                <button
                  className="w-full px-4 py-2.5 text-left text-sm transition hover:opacity-80"
                  style={{ color: "var(--danger)" }}
                  onClick={async () => {
                    try {
                      await fetch("/api/auth/logout")
                    } catch {
                      /* ignore */
                    }
                    window.location.href = "/"
                  }}
                >
                  Sign out
                </button>
              ) : (
                <button
                  className="w-full px-4 py-2.5 text-left text-sm transition hover:opacity-80"
                  style={{ color: "var(--text)" }}
                  onClick={() => (window.location.href = "/api/auth/login")}
                >
                  Partner sign in
                </button>
              )}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAccountOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:opacity-90"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                style={{ background: "var(--text)", color: "var(--bg)" }}
              >
                {(displayName || "G")[0].toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[0.82rem] font-medium">{displayName || "Guest"}</span>
                <span className="block truncate text-[0.68rem]" style={{ color: "var(--text-subtle)" }}>
                  {email || "Not signed in"}
                </span>
              </span>
            </button>
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition hover:opacity-80"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              {theme === "light" ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* ------------------------- MAIN ------------------------- */}
      <main className="flex h-full min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header
          className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-6"
          style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 88%, transparent)" }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border md:hidden"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              aria-label="Open sidebar"
            >
              <MenuIcon />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{config.label}</span>
              <span className="hidden text-[0.75rem] sm:inline" style={{ color: "var(--text-subtle)" }}>
                · {config.blurb}
              </span>
            </div>
          </div>
          <button
            onClick={startNewChat}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[0.78rem] font-medium transition hover:opacity-80"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            <PlusIcon className="h-3.5 w-3.5" /> New
          </button>
        </header>

        {/* token bar */}
        {config.needsToken ? (
          <div className="border-b px-4 py-2.5 md:px-6" style={{ borderColor: "var(--border)", background: "var(--surface-soft)" }}>
            <div className="mx-auto flex max-w-3xl items-center gap-2">
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste GPS partner / admin JWT to authenticate this workspace…"
                className="w-full rounded-lg border px-3 py-1.5 text-xs outline-none transition focus:border-[color:var(--accent)]"
                style={{
                  borderColor: token ? "var(--border)" : "var(--danger)",
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
              />
              <span
                className="hidden shrink-0 rounded-md px-2 py-1 text-[0.66rem] font-medium sm:inline"
                style={{ background: token ? "var(--accent-soft)" : "var(--surface)", color: token ? "var(--accent)" : "var(--danger)" }}
              >
                {token ? "Authenticated" : "Token required"}
              </span>
            </div>
          </div>
        ) : null}

        {/* conversation / empty state */}
        <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-5 py-10">
              <div className="rise w-full text-center" style={{ animationDelay: "0.02s" }}>
                <MyraMark size={52} />
              </div>
              <h1
                className="rise mt-6 text-center text-[2rem] leading-tight sm:text-[2.6rem]"
                style={{ fontFamily: "var(--font-display)", fontWeight: 500, letterSpacing: "-0.01em", animationDelay: "0.08s" }}
              >
                {greeting()}
                {displayName ? <span style={{ color: "var(--text-muted)" }}>, {displayName.split(" ")[0]}</span> : ""}
              </h1>
              <p
                className="rise mt-2.5 max-w-md text-center text-[0.98rem]"
                style={{ color: "var(--text-muted)", animationDelay: "0.14s" }}
              >
                Ask anything about loans, eligibility, EMIs and your pipeline — I&apos;ll keep it clear and grounded in real numbers.
              </p>

              <div className="rise mt-8 w-full" style={{ animationDelay: "0.2s" }}>
                <Composer
                  value={input}
                  onChange={setInput}
                  onKey={onComposerKey}
                  onSend={() => void sendMessage()}
                  loading={loading}
                  inputRef={inputRef}
                  centered
                />
              </div>

              <div className="rise mt-6 flex w-full flex-wrap justify-center gap-2" style={{ animationDelay: "0.28s" }}>
                {config.starters.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setInput(s)
                      inputRef.current?.focus()
                    }}
                    className="rounded-full border px-3.5 py-2 text-[0.8rem] transition hover:-translate-y-0.5"
                    style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-muted)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
              {messages.map((m) => (
                <div key={m.id} className="msg-in mb-7">
                  {m.role === "user" ? (
                    <div className="flex justify-end">
                      <div
                        className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-[0.92rem] leading-relaxed"
                        style={{ background: "var(--text)", color: "var(--bg)" }}
                        dir="auto"
                      >
                        {m.text}
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3.5">
                      <MyraMark size={30} />
                      <div className="min-w-0 flex-1 pt-1 text-[0.92rem]" style={{ color: "var(--text)" }} dir="auto">
                        <FormattedChatMessage text={m.text} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {loading ? (
                <div className="msg-in mb-7 flex gap-3.5">
                  <MyraMark size={30} />
                  <div className="flex items-center gap-1.5 pt-3">
                    <span className="typing-dot" style={{ animationDelay: "0s" }} />
                    <span className="typing-dot" style={{ animationDelay: "0.18s" }} />
                    <span className="typing-dot" style={{ animationDelay: "0.36s" }} />
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* docked composer (only when in a conversation) */}
        {!isEmpty ? (
          <div className="shrink-0 px-4 pb-4 pt-1 md:px-6" style={{ background: "linear-gradient(to top, var(--bg) 60%, transparent)" }}>
            <div className="mx-auto max-w-3xl">
              <Composer
                value={input}
                onChange={setInput}
                onKey={onComposerKey}
                onSend={() => void sendMessage()}
                loading={loading}
                inputRef={inputRef}
              />
              <p className="mt-2 text-center text-[0.68rem]" style={{ color: "var(--text-subtle)" }}>
                Myra can be wrong. Verify figures before acting on them.
              </p>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}

/* ----------------------------- composer ----------------------------- */
function Composer({
  value,
  onChange,
  onKey,
  onSend,
  loading,
  inputRef,
  centered = false,
}: {
  value: string
  onChange: (v: string) => void
  onKey: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  loading: boolean
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  centered?: boolean
}) {
  return (
    <div
      className="flex items-end gap-2 rounded-[22px] border p-2 pl-4 transition-shadow focus-within:shadow-[0_0_0_4px_var(--accent-ring)]"
      style={{ borderColor: "var(--border-strong)", background: "var(--surface-elev)", boxShadow: "var(--shadow-md)" }}
    >
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        rows={centered ? 2 : 1}
        dir="auto"
        placeholder="Ask about loans, eligibility, EMIs…  /  लोन के बारे में पूछें"
        className="scroll-thin max-h-40 min-h-[24px] flex-1 resize-none self-center bg-transparent py-1.5 text-[0.95rem] leading-relaxed outline-none placeholder:text-[color:var(--text-subtle)]"
        style={{ color: "var(--text)" }}
      />
      <button
        onClick={onSend}
        disabled={loading || !value.trim()}
        aria-label="Send message"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40"
        style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
      >
        <SendIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
