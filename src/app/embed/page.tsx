import { Suspense } from "react"
import EmbedChat from "@/components/Chat/EmbedChat"

export default function EmbedPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm">Loading chat...</div>}>
      <EmbedChat />
    </Suspense>
  )
}
