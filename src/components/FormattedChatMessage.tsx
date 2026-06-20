import { parseChatText } from "@/lib/chatFormatting"

type FormattedChatMessageProps = {
  text: string
}

export function FormattedChatMessage({ text }: FormattedChatMessageProps) {
  const blocks = parseChatText(text)

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <p key={index} className="font-semibold">
              {block.text}
            </p>
          )
        }

        if (block.type === "bulleted-list") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          )
        }

        if (block.type === "numbered-list") {
          return (
            <ol key={index} className="list-decimal space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ol>
          )
        }

        return <p key={index}>{block.text}</p>
      })}
    </div>
  )
}
