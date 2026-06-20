export type ChatTextBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "bulleted-list"; items: string[] }
  | { type: "numbered-list"; items: string[] }

const bulletPattern = /^\s*[-*]\s+(.+)$/
const numberPattern = /^\s*\d+[.)]\s+(.+)$/
const headingPattern = /^\s*#{1,6}\s+(.+)$/

export function parseChatText(text: string): ChatTextBlock[] {
  const blocks: ChatTextBlock[] = []
  let paragraph: string[] = []
  let list: { type: "bulleted-list" | "numbered-list"; items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ") })
      paragraph = []
    }
  }

  const flushList = () => {
    if (list?.items.length) {
      blocks.push(list)
    }
    list = null
  }

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = line.match(headingPattern)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: "heading", text: heading[1].trim() })
      continue
    }

    const bullet = line.match(bulletPattern)
    const number = line.match(numberPattern)
    const listType = bullet ? "bulleted-list" : number ? "numbered-list" : null
    const item = bullet?.[1] ?? number?.[1]

    if (listType && item) {
      flushParagraph()
      if (!list || list.type !== listType) {
        flushList()
        list = { type: listType, items: [] }
      }
      list.items.push(item.trim())
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()

  return blocks.length ? blocks : [{ type: "paragraph", text }]
}
