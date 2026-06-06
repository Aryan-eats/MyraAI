'use client'

import React, { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import axios from "axios"
import { useRouter } from "next/navigation"

function HomeClient({ email = "", ownerId = "" }: { email?: string; ownerId?: string }) {
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)
  const navigate = useRouter()

  const firstLetter = email ? email[0].toUpperCase() : ""

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const features = [
    {
      title: "Public Lending Advisor",
      desc: "Guide borrowers on products, eligibility basics, rates, and process without exposing partner data.",
    },
    {
      title: "Partner CRM Copilot",
      desc: "Support partner teams with docs pending, conversion insights, and action-first pipeline assistance.",
    },
    {
      title: "Knowledge Controlled",
      desc: "Update business context from dashboard settings and deploy the web assistant with one embed script.",
    },
  ]

  const handleLogin = () => {
    setLoading(true)
    window.location.href = "/api/auth/login"
  }

  const handleLogout = async () => {
    try {
      await axios.get("/api/auth/logout")
      window.location.href = "/"
    } catch (error) {
      console.log(error)
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
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
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight">
            Myra <span className="text-zinc-400">AI</span>
          </div>
          {email ? (
            <div className="relative" ref={popupRef}>
              <button
                className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-semibold hover:scale-105 transition"
                onClick={() => setOpen((value) => !value)}
              >
                {firstLetter}
              </button>
              <AnimatePresence>
                {open && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="absolute right-0 mt-3 w-44 rounded-xl shadow-xl border overflow-hidden"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                  >
                    <button
                      className="w-full text-left px-4 py-3 text-sm hover:bg-zinc-100"
                      onClick={() => navigate.push("/dashboard")}
                    >
                      Dashboard
                    </button>
                    <button className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-zinc-100" onClick={handleLogout}>
                      Logout
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button
              className="px-5 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-60"
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? "Loading..." : "Partner Login"}
            </button>
          )}
        </div>
      </motion.div>

      <section className="pt-36 pb-28 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <h1 className="text-4xl md:text-5xl font-semibold leading-tight tracking-tight">
              Dual-Agent Lending AI
              <br />
              for GPS India Teams
            </h1>
            <p className="mt-6 text-lg max-w-xl" style={{ color: "var(--text-muted)" }}>
              Myra combines a public borrower advisor with a secure CRM operations copilot so you can move from lead interest to
              loan disbursal with less friction.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              {email ? (
                <button
                  className="px-7 py-3 rounded-xl bg-black text-white font-medium hover:bg-zinc-800 transition disabled:opacity-60"
                  onClick={() => navigate.push("/dashboard")}
                >
                  Go to Dashboard
                </button>
              ) : (
                <button
                  className="px-7 py-3 rounded-xl bg-black text-white font-medium hover:bg-zinc-800 transition disabled:opacity-60"
                  onClick={handleLogin}
                >
                  Start as Partner
                </button>
              )}

              <button
                className="px-7 py-3 rounded-xl border border-zinc-300 text-zinc-700 hover:bg-zinc-100 transition"
                onClick={() => navigate.push("/chat?mode=web")}
              >
                Try Web Advisor
              </button>

              <button
                className="px-7 py-3 rounded-xl border border-zinc-300 text-zinc-700 hover:bg-zinc-100 transition"
                onClick={() => navigate.push(ownerId ? `/chat?mode=crm&ownerId=${ownerId}` : "/chat?mode=crm")}
              >
                Open CRM Copilot
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative"
          >
            <div className="rounded-2xl shadow-2xl border p-6" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
                Product Flow Snapshot
              </div>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg px-4 py-3 border" style={{ backgroundColor: "var(--surface-soft)", borderColor: "var(--border)" }}>
                  Borrower asks: &quot;What loan options fit INR 18L with current EMI 29K?&quot;
                </div>
                <div className="rounded-lg px-4 py-3 bg-black text-white ml-5">
                  Web advisor shares eligibility guidance and captures lead interest.
                </div>
                <div className="rounded-lg px-4 py-3 border" style={{ backgroundColor: "var(--surface-soft)", borderColor: "var(--border)" }}>
                  CRM copilot tracks docs pending, approval risk, and next partner action.
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-28 px-6 border-t" style={{ backgroundColor: "var(--surface-soft)", borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-semibold text-center"
          >
            What the Platform Delivers
          </motion.h2>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-10">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: false }}
                className="rounded-2xl p-8 shadow-lg border"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
              >
                <h1 className="text-lg font-medium">{feature.title}</h1>
                <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        Copyright {new Date().getFullYear()} Myra AI. GPS India partner platform.
      </footer>
    </div>
  )
}

export default HomeClient
