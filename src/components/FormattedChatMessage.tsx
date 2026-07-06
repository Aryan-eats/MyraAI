import React from "react"
import { parseChatText } from "@/lib/chatFormatting"

type FormattedChatMessageProps = {
  text: string
}

// Inline renderer: **bold**, *italic*, `code`, and ₹/currency emphasis.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    const key = `${keyPrefix}-${i++}`
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold" style={{ color: "var(--text)" }}>
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded px-1.5 py-0.5 text-[0.85em] tnum"
          style={{ backgroundColor: "var(--surface-soft)", fontFamily: "var(--font-mono)", color: "var(--accent)" }}
        >
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      )
    }
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

export function FormattedChatMessage({ text }: FormattedChatMessageProps) {
  const blocks = parseChatText(text)

  return (
    <div className="space-y-3 leading-relaxed">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <p
              key={index}
              className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] pt-1"
              style={{ color: "var(--accent)" }}
            >
              {renderInline(block.text, `h${index}`)}
            </p>
          )
        }

        if (block.type === "bulleted-list") {
          return (
            <ul key={index} className="space-y-1.5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="flex gap-2.5">
                  <span
                    className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: "var(--accent)" }}
                  />
                  <span>{renderInline(item, `b${index}-${itemIndex}`)}</span>
                </li>
              ))}
            </ul>
          )
        }

        if (block.type === "numbered-list") {
          return (
            <ol key={index} className="space-y-1.5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="flex gap-2.5">
                  <span
                    className="mt-[0.1em] flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold tnum"
                    style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}
                  >
                    {itemIndex + 1}
                  </span>
                  <span className="pt-[0.1em]">{renderInline(item, `n${index}-${itemIndex}`)}</span>
                </li>
              ))}
            </ol>
          )
        }

        return (
          <p key={index} className="tnum">
            {renderInline(block.text, `p${index}`)}
          </p>
        )
      })}
    </div>
  )
}
