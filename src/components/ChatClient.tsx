'use client'

import React from "react"
import ChatWorkspace from "@/components/ChatWorkspace"

type ChatMode = "web" | "crm" | "partner" | "admin"

type ChatClientProps = {
  ownerId?: string
  mode: ChatMode
}

function ChatClient({ ownerId = "", mode }: ChatClientProps) {
  return <ChatWorkspace ownerId={ownerId} defaultMode={mode} />
}

export default ChatClient
