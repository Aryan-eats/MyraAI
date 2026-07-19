const API_URL = (process.env.NEXT_PUBLIC_LOANAPP_API_URL || "http://localhost:5000/api").replace(/\/+$/, "")

export type ChatUser = {
  id: string
  email: string
  firstName?: string
  lastName?: string
}

export type AssistantConversation = {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
}

export type AssistantMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}

export type AssistantReply = {
  conversationId: string
  message: string
  actions: Array<{ label: string; href?: string }>
}

let accessToken = ""

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  })
  if (response.status === 204) return undefined as T
  const payload = await response.json() as { success: boolean; data?: T; message?: string }
  if (!response.ok || !payload.success) throw new Error(payload.message || "LoanApp request failed")
  return payload.data as T
}

export const getAssistantSessionId = (): string => {
  const existing = localStorage.getItem("assistantSessionId")
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem("assistantSessionId", id)
  return id
}

const ownerQuery = () => `sessionId=${encodeURIComponent(getAssistantSessionId())}`

export const refreshChatAuth = async (): Promise<ChatUser> => {
  const data = await request<{ accessToken: string; user: ChatUser }>("/auth/chat/refresh", { method: "POST" })
  accessToken = data.accessToken
  return data.user
}

export const startGoogleChatLogin = (): void => {
  window.location.assign(`${API_URL}/auth/chat/google`)
}

export const logoutChat = async (): Promise<void> => {
  try {
    await request<void>("/auth/chat/logout", { method: "POST" })
  } finally {
    accessToken = ""
  }
}

export const listAssistantConversations = () =>
  request<AssistantConversation[]>(`/assistant/conversations?${ownerQuery()}`)

export const loadAssistantConversation = (conversationId: string) =>
  request<{ conversationId: string; messages: AssistantMessage[] }>(
    `/assistant/conversations/${encodeURIComponent(conversationId)}/messages?${ownerQuery()}`,
  )

export const sendAssistantMessage = (message: string, conversationId?: string) =>
  request<AssistantReply>("/assistant/message", {
    method: "POST",
    body: JSON.stringify({ message, conversationId, sessionId: getAssistantSessionId() }),
  })

export const deleteAssistantConversation = (conversationId: string) =>
  request<void>(`/assistant/conversations/${encodeURIComponent(conversationId)}?${ownerQuery()}`, { method: "DELETE" })
