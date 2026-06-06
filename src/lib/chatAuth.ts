import { NextRequest } from "next/server"
import { jwtVerify, importSPKI } from "jose"
import type { AuthenticatedPartner } from "@/types/agents"

export type ChatUserRole = "customer" | "partner" | "admin" | "anonymous"

export type ChatUser = {
  userId: string
  userRole: ChatUserRole
  entityId: string | null
  token: string | null
  authenticated: boolean
}

type MeResponse = {
  userId: string
  userRole: "customer" | "partner" | "admin"
  entityId: string | null
  name?: string
  tier?: string
}

const ANONYMOUS_USER: ChatUser = {
  userId: "anonymous",
  userRole: "anonymous",
  entityId: null,
  token: null,
  authenticated: false,
}

function getTokenFromRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim()
  }
  return req.nextUrl.searchParams.get("gpsToken")
}

async function fetchMe(token: string): Promise<MeResponse | null> {
  const baseUrl = process.env.GPS_INDIA_API_URL
  if (!baseUrl) {
    return null
  }

  try {
    const response = await fetch(`${baseUrl}/internal/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as MeResponse
  } catch {
    return null
  }
}

async function verifyJwtSignatureIfConfigured(token: string): Promise<boolean> {
  const publicKey = process.env.GPS_JWT_PUBLIC_KEY
  const issuer = process.env.GPS_JWT_ISSUER
  const audience = process.env.GPS_JWT_AUDIENCE

  if (!publicKey) {
    return true
  }

  try {
    const key = await importSPKI(publicKey, "RS256")
    await jwtVerify(token, key, {
      issuer: issuer || undefined,
      audience: audience || undefined,
    })
    return true
  } catch {
    return false
  }
}

export async function getChatUser(req: NextRequest): Promise<ChatUser> {
  const token = getTokenFromRequest(req)
  if (!token) {
    return ANONYMOUS_USER
  }

  const sigOk = await verifyJwtSignatureIfConfigured(token)
  if (!sigOk) {
    return ANONYMOUS_USER
  }

  const me = await fetchMe(token)
  if (!me) {
    return ANONYMOUS_USER
  }

  return {
    userId: me.userId,
    userRole: me.userRole,
    entityId: me.entityId ?? null,
    token,
    authenticated: true,
  }
}

export async function requirePartnerAuth(req: NextRequest): Promise<AuthenticatedPartner | null> {
  const token = getTokenFromRequest(req)
  if (!token) {
    return null
  }

  const sigOk = await verifyJwtSignatureIfConfigured(token)
  if (!sigOk) {
    return null
  }

  const me = await fetchMe(token)
  if (!me || me.userRole !== "partner" || !me.entityId) {
    return null
  }

  return {
    userId: me.userId,
    partnerId: me.entityId,
    partnerName: me.name ?? "Partner",
    partnerTier: me.tier ?? "standard",
    token,
  }
}

export function requireSessionId(req: NextRequest): string {
  const headerSession = req.headers.get("x-session-id")
  if (headerSession?.trim()) {
    return headerSession.trim()
  }
  return crypto.randomUUID()
}
