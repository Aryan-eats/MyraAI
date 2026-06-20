'use client'

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

function DashboardClient({ ownerId }: { ownerId: string }) {
  const navigate = useRouter()
  const [businessName, setBusinessName] = useState("")
  const [supportEmail, setSupportEmail] = useState("")
  const [knowledge, setKnowledge] = useState("")
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSettings = async () => {
    setLoading(true)
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId, businessName, supportEmail, knowledge }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.log(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!ownerId) {
      return
    }

    const handleGetDetails = async () => {
      try {
        const response = await fetch(`/api/settings?ownerId=${encodeURIComponent(ownerId)}`, { cache: "no-store" })
        const result = await response.json()
        setBusinessName(result?.businessName || "")
        setSupportEmail(result?.supportEmail || "")
        setKnowledge(result?.knowledge || "")
      } catch (error) {
        console.log(error)
      }
    }

    void handleGetDetails()
  }, [ownerId])

  const quickActions = [
    { title: "Manage Bots", desc: "Create bots, edit settings, and copy embed code.", href: "/dashboard/bots" },
    { title: "Test Web Advisor", desc: "Validate borrower-facing guidance and product coverage.", href: "/chat?mode=web" },
    { title: "CRM Copilot", desc: "Ask about blocked files, reminders, or commissions.", href: `/chat?mode=crm&ownerId=${ownerId}` },
    { title: "Partner Chatbot", desc: "Test the authenticated partner pipeline chatbot.", href: "/chat?mode=partner" },
    { title: "Admin Chatbot", desc: "Test the admin platform analytics chatbot.", href: "/chat?mode=admin" },
    { title: "Embed Assistant", desc: "Deploy the chat widget — pick a bot from Manage Bots first.", href: "/dashboard/bots" },
  ]

  return (
    <div className="min-h-screen">
      <div
        className="fixed top-0 left-0 w-full z-50 border-b backdrop-blur-xl"
        style={{
          backgroundColor: "color-mix(in srgb, var(--surface) 82%, transparent)",
          borderColor: "var(--border)",
        }}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button className="text-lg font-semibold tracking-tight cursor-pointer" onClick={() => navigate.push("/")}>
            Myra <span className="text-zinc-400">AI</span>
          </button>
          <button className="px-4 py-2 rounded-lg border text-sm hover:bg-zinc-100 transition" style={{ borderColor: "var(--border)" }} onClick={() => navigate.push("/dashboard/bots")}>
            Embed Assistant
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-14 mt-20 space-y-8">
        <div className="rounded-2xl border shadow-xl p-8" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
          <h1 className="text-2xl font-semibold">Partner Control Center</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Configure borrower-facing responses and launch CRM operations workflows from one workspace.
          </p>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 lg:grid-cols-3">
            {quickActions.map((item) => (
              <button
                key={item.title}
                className="text-left rounded-xl border p-4 hover:bg-zinc-50 transition"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-soft)" }}
                onClick={() => navigate.push(item.href)}
              >
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {item.desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border shadow-xl p-8" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="mb-8">
            <h2 className="text-xl font-semibold">Assistant Settings</h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              This knowledge is used for borrower FAQ responses in the public web advisor.
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-base font-medium mb-3">Business Details</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80"
                  style={{ borderColor: "var(--border)" }}
                  placeholder="Business Name"
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                />
                <input
                  type="text"
                  className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80"
                  style={{ borderColor: "var(--border)" }}
                  placeholder="Support Email"
                  value={supportEmail}
                  onChange={(event) => setSupportEmail(event.target.value)}
                />
              </div>
            </div>

            <div>
              <h3 className="text-base font-medium mb-2">Knowledge Base Notes</h3>
              <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
                Add policy, product, and process snippets that can be safely shown in public chat.
              </p>
              <textarea
                className="w-full min-h-56 rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/80"
                style={{ borderColor: "var(--border)" }}
                placeholder={`Example:
- Product: Business Loan up to INR 50L
- Document: Last 6 months bank statement
- Process: Typical login to sanction is 3 to 7 days
- Disclaimer: Final approval is subject to lender assessment`}
                onChange={(event) => setKnowledge(event.target.value)}
                value={knowledge}
              />
            </div>
          </div>

          <div className="flex items-center gap-5 mt-8">
            <button
              disabled={loading}
              onClick={handleSettings}
              className="px-7 py-3 rounded-xl bg-black text-white text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-60"
            >
              {loading ? "Saving..." : "Save Settings"}
            </button>
            {saved ? (
              <span className="text-sm font-medium text-emerald-600">
                Settings saved
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardClient
