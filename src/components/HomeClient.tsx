'use client'

import React from "react"
import ChatWorkspace from "@/components/ChatWorkspace"

function HomeClient({ email = "", ownerId = "" }: { email?: string; ownerId?: string }) {
  return <ChatWorkspace email={email} ownerId={ownerId} defaultMode="web" />
}

export default HomeClient
