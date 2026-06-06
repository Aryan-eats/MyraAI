'use client'

import { useRouter } from "next/navigation"
import React, { useState } from "react"
import { motion } from "motion/react"

function EmbedClient({ ownerId }: { ownerId: string }) {
  const navigate = useRouter()
  const [copied, setCopied] = useState(false)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const embedCode = `<script src="${appUrl}/chatBot.js" data-owner-id="${ownerId}"></script>`

  const copyCode = () => {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen">
      <div
        className="sticky top-0 z-40 border-b"
        style={{
          backgroundColor: "color-mix(in srgb, var(--surface) 90%, transparent)",
          borderColor: "var(--border)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button className="text-lg font-semibold cursor-pointer" onClick={() => navigate.push("/")}>
            Myra <span className="text-zinc-400">AI</span>
          </button>
          <button className="px-4 py-2 rounded-lg border text-sm hover:bg-zinc-100 transition" style={{ borderColor: "var(--border)" }} onClick={() => navigate.push("/dashboard")}>
            Back to Dashboard
          </button>
        </div>
      </div>

      <div className="flex justify-center px-4 py-14">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-4xl rounded-2xl shadow-xl p-10 border"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
        >
          <h1 className="text-2xl font-semibold mb-2">Embed Web Lending Advisor</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Place this script before <code>&lt;/body&gt;</code> on your public website.
          </p>

          <div className="relative rounded-xl p-5 text-sm font-mono my-6 bg-zinc-900 text-zinc-100">
            <pre className="overflow-x-auto">{embedCode}</pre>
            <button className="absolute top-3 right-3 bg-white text-zinc-900 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-zinc-200 transition" onClick={copyCode}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <ol className="space-y-2 text-sm list-decimal list-inside" style={{ color: "var(--text-muted)" }}>
            <li>Copy the embed script.</li>
            <li>Paste it before the closing body tag on your public site.</li>
            <li>Reload your website and test borrower-facing prompts.</li>
          </ol>

          <div className="mt-12">
            <h2 className="text-lg font-medium mb-2">Preview</h2>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              This simulates how the floating assistant appears to site visitors.
            </p>

            <div className="rounded-xl border shadow-md overflow-hidden" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
              <div className="flex items-center gap-2 px-4 h-9 border-b" style={{ backgroundColor: "var(--surface-soft)", borderColor: "var(--border)" }}>
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                <span className="ml-4 text-xs" style={{ color: "var(--text-muted)" }}>
                  your-website.com
                </span>
              </div>
              <div className="relative h-64 sm:h-72 p-6 text-sm" style={{ color: "var(--text-muted)" }}>
                Website content
                <div className="absolute bottom-24 right-6 w-64 rounded-xl shadow-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                  <div className="bg-black text-white text-xs px-3 py-2 flex justify-between items-center">
                    <span>Myra Advisor</span>
                    <span>x</span>
                  </div>
                  <div className="p-3 space-y-2" style={{ backgroundColor: "var(--surface-soft)" }}>
                    <div className="text-xs px-3 py-2 rounded-lg w-fit bg-zinc-200 text-zinc-800">How can I help with your loan query?</div>
                    <div className="text-xs px-3 py-2 rounded-lg ml-auto w-fit bg-black text-white">What documents do I need?</div>
                  </div>
                </div>
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 3 }}
                  className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-black text-white flex items-center justify-center shadow-2xl"
                >
                  AI
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default EmbedClient
