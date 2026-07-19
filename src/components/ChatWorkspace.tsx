"use client"

import React, { useEffect, useRef, useState } from "react"
import { FormattedChatMessage } from "@/components/FormattedChatMessage"
import {
  deleteAssistantConversation,
  listAssistantConversations,
  loadAssistantConversation,
  logoutChat,
  refreshChatAuth,
  sendAssistantMessage,
  startGoogleChatLogin,
  type AssistantConversation,
  type AssistantMessage,
  type ChatUser,
} from "@/lib/loanAppApi"

const ACTIVE_CONVERSATION_KEY = "assistantConversationId"
const THEME_KEY = "myra.theme"
const starters = [
  "Which loan options fit a self-employed borrower?",
  "How does FOIR affect my eligibility?",
  "What documents are needed for a home loan?",
  "Compare personal loan rates across lenders",
]

type DisplayMessage = Pick<AssistantMessage, "id" | "role" | "content">

function Mark({ size = 30 }: { size?: number }) {
  return <span className="inline-flex shrink-0 items-center justify-center rounded-[10px] font-semibold" style={{
    width: size, height: size, background: "var(--accent)", color: "var(--accent-contrast)",
    fontFamily: "var(--font-display)", fontSize: size * 0.5,
  }}>M</span>
}

export default function ChatWorkspace() {
  const [conversations, setConversations] = useState<AssistantConversation[]>([])
  const [conversationId, setConversationId] = useState<string>()
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [user, setUser] = useState<ChatUser | null>(null)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const refreshHistory = async () => setConversations(await listAssistantConversations())

  const openConversation = async (id: string) => {
    const history = await loadAssistantConversation(id)
    setConversationId(id)
    setMessages(history.messages)
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, id)
    setSidebarOpen(false)
  }

  useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_KEY) as "light" | "dark" | null
    const nextTheme = storedTheme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    setTheme(nextTheme)
    document.documentElement.setAttribute("data-theme", nextTheme)

    void refreshChatAuth().then(setUser).catch(() => setUser(null)).finally(async () => {
      try {
        const rows = await listAssistantConversations()
        setConversations(rows)
        const storedId = localStorage.getItem(ACTIVE_CONVERSATION_KEY)
        if (storedId && rows.some((row) => row.id === storedId)) await openConversation(storedId)
      } catch {
        setConversations([])
      }
    })
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, busy])

  const newConversation = () => {
    setConversationId(undefined)
    setMessages([])
    localStorage.removeItem(ACTIVE_CONVERSATION_KEY)
    setSidebarOpen(false)
    inputRef.current?.focus()
  }

  const removeConversation = async (id: string) => {
    await deleteAssistantConversation(id)
    if (id === conversationId) newConversation()
    await refreshHistory()
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    const userMessage: DisplayMessage = { id: crypto.randomUUID(), role: "user", content: text }
    setMessages((current) => [...current, userMessage])
    setInput("")
    setBusy(true)
    try {
      const reply = await sendAssistantMessage(text, conversationId)
      setConversationId(reply.conversationId)
      localStorage.setItem(ACTIVE_CONVERSATION_KEY, reply.conversationId)
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), role: "assistant", content: reply.message,
      }])
      await refreshHistory()
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), role: "assistant",
        content: error instanceof Error ? error.message : "The loan assistant is unavailable. Please try again.",
      }])
    } finally {
      setBusy(false)
    }
  }

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light"
    setTheme(next)
    localStorage.setItem(THEME_KEY, next)
    document.documentElement.setAttribute("data-theme", next)
  }

  return <div className="flex h-screen w-full overflow-hidden" style={{ background: "var(--bg)", color: "var(--text)" }}>
    {sidebarOpen && <button aria-label="Close history" className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />}
    <aside className={`fixed z-40 flex h-full w-[278px] flex-col border-r transition-transform md:static md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2.5 px-5 py-5"><Mark /><div><p className="text-sm font-semibold">Myra AI</p><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Loan and finance advisor</p></div></div>
      <div className="px-3"><button onClick={newConversation} className="w-full rounded-xl px-3.5 py-2.5 text-left text-sm font-medium" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>+ New conversation</button></div>
      <nav aria-label="Conversation history" className="scroll-thin mt-5 flex-1 overflow-y-auto px-3">
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>History</p>
        {conversations.length ? conversations.map((conversation) => <div key={conversation.id} className="mb-1 flex items-center gap-1">
          <button onClick={() => void openConversation(conversation.id)} className="min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-sm" style={{ background: conversation.id === conversationId ? "var(--surface-soft)" : "transparent" }}>{conversation.title || "Loan conversation"}</button>
          <button aria-label="Delete conversation" onClick={() => void removeConversation(conversation.id)} className="rounded p-2 text-xs" style={{ color: "var(--danger)" }}>×</button>
        </div>) : <p className="px-2 text-sm" style={{ color: "var(--text-subtle)" }}>Your conversations will appear here.</p>}
      </nav>
      <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
        <p className="truncate text-sm font-medium">{user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : "Guest"}</p>
        <p className="truncate text-xs" style={{ color: "var(--text-subtle)" }}>{user?.email || "Anonymous history stays in this browser"}</p>
        <div className="mt-2 flex gap-2">
          {user ? <button className="rounded-lg border px-3 py-1.5 text-xs" onClick={() => void logoutChat().then(() => { setUser(null); newConversation(); return refreshHistory() })}>Sign out</button>
            : <button className="rounded-lg border px-3 py-1.5 text-xs" onClick={startGoogleChatLogin}>Sign in with Google</button>}
          <button className="rounded-lg border px-3 py-1.5 text-xs" onClick={toggleTheme}>{theme === "light" ? "Dark" : "Light"}</button>
        </div>
      </div>
    </aside>

    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3"><button aria-label="Open history" className="md:hidden" onClick={() => setSidebarOpen(true)}>☰</button><strong className="text-sm">Expert bank loan advisor</strong></div>
        <button onClick={newConversation} className="rounded-lg border px-3 py-1.5 text-xs">New</button>
      </header>
      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto">
        {messages.length === 0 ? <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-5 py-10 text-center">
          <Mark size={52} /><h1 className="mt-6 text-4xl" style={{ fontFamily: "var(--font-display)" }}>How can I help?</h1>
          <p className="mt-3 max-w-lg" style={{ color: "var(--text-muted)" }}>Ask about loans, banking, eligibility, EMIs, documents, rates, or responsible financial planning.</p>
          <Composer value={input} setValue={setInput} send={send} busy={busy} inputRef={inputRef} wide />
          <div className="mt-5 flex flex-wrap justify-center gap-2">{starters.map((starter) => <button key={starter} onClick={() => setInput(starter)} className="rounded-full border px-3 py-2 text-xs">{starter}</button>)}</div>
        </div> : <div className="mx-auto max-w-3xl px-4 py-8">{messages.map((message) => <div key={message.id} className="mb-7">
          {message.role === "user" ? <div className="flex justify-end"><p dir="auto" className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm" style={{ background: "var(--text)", color: "var(--bg)" }}>{message.content}</p></div>
            : <div className="flex gap-3"><Mark /><div dir="auto" className="min-w-0 flex-1 pt-1 text-sm"><FormattedChatMessage text={message.content} /></div></div>}
        </div>)}{busy && <div className="flex gap-3"><Mark /><p className="pt-1 text-sm" style={{ color: "var(--text-muted)" }}>Thinking…</p></div>}</div>}
      </div>
      {messages.length > 0 && <div className="px-4 pb-4"><div className="mx-auto max-w-3xl"><Composer value={input} setValue={setInput} send={send} busy={busy} inputRef={inputRef} /><p className="mt-2 text-center text-xs" style={{ color: "var(--text-subtle)" }}>Verify lender terms and web-searched information before acting.</p></div></div>}
    </main>
  </div>
}

function Composer({ value, setValue, send, busy, inputRef, wide = false }: {
  value: string
  setValue: (value: string) => void
  send: () => Promise<void>
  busy: boolean
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  wide?: boolean
}) {
  return <div className={`${wide ? "mt-8 w-full" : ""} flex items-end gap-2 rounded-[22px] border p-2 pl-4`} style={{ background: "var(--surface-elev)", borderColor: "var(--border-strong)" }}>
    <textarea ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send() } }} rows={wide ? 2 : 1} dir="auto" placeholder="Ask about loans, eligibility, EMIs… / लोन के बारे में पूछें" className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none" />
    <button aria-label="Send message" disabled={busy || !value.trim()} onClick={() => void send()} className="h-9 w-9 rounded-full disabled:opacity-40" style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}>↑</button>
  </div>
}
