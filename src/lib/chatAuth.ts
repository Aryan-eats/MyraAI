import { NextRequest } from "next/server"
import { jwtVerify, importSPKI, decodeJwt } from "jose"
import type { AuthenticatedPartner } from "@/types/agents"
import { hasPostgres } from "@/lib/pgClient"
import { resolvePartnerOrgForUser } from "@/lib/crmDb"
import { ADMIN_ROLES, getUser } from "@/lib/adminDb"

export type ChatUserRole = "customer" | "partner" | "admin" | "anonymous"

export type AuthenticatedAdmin = {
  userId: string
  role: string
  name: string
  token: string
}

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

type BackendMeResponse = MeResponse | { data?: { user?: Record<string, unknown> } }

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

function normalizeRole(role: unknown): MeResponse["userRole"] | null {
  if (role === "customer" || role === "partner" || role === "admin") {
    return role
  }
  return null
}

function valueAsString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function normalizeMeResponse(payload: BackendMeResponse): MeResponse | null {
  if ("userId" in payload && "userRole" in payload) {
    return payload as MeResponse
  }

  const user = payload.data?.user
  if (!user) {
    return null
  }

  const userId = valueAsString(user.userId) ?? valueAsString(user.id)
  const userRole = normalizeRole(user.userRole ?? user.role)
  if (!userId || !userRole) {
    return null
  }

  const firstName = valueAsString(user.firstName)
  const lastName = valueAsString(user.lastName)
  const fullName = [firstName, lastName].filter(Boolean).join(" ")

  return {
    userId,
    userRole,
    entityId:
      valueAsString(user.entityId) ??
      valueAsString(user.partnerId) ??
      valueAsString(user.partnerOrgId) ??
      (userRole === "partner" ? userId : null),
    name: valueAsString(user.name) ?? (fullName || undefined),
    tier: valueAsString(user.tier),
  }
}

async function fetchMe(token: string): Promise<MeResponse | null> {
  const baseUrl = process.env.GPS_INDIA_API_URL
  if (!baseUrl) {
    return null
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })

    if (!response.ok) {
      return null
    }

    return normalizeMeResponse((await response.json()) as BackendMeResponse)
  } catch {
    return null
  }
}

/** Read the subject (user ID) from a JWT without verifying its signature. */
function getJwtSubject(token: string): string | null {
  try {
    const payload = decodeJwt(token)
    return typeof payload.sub === "string" ? payload.sub : null
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

  // Primary path: resolve the partner org scope from the GPS India database.
  if (hasPostgres()) {
    const userId = me?.userId ?? getJwtSubject(token)
    if (!userId) {
      return null
    }
    const org = await resolvePartnerOrgForUser(userId)
    if (!org) {
      return null
    }
    return {
      userId,
      partnerId: org.partnerOrgId,
      partnerName: me?.name ?? org.name,
      partnerTier: me?.tier ?? "standard",
      token,
    }
  }

  // Legacy path: trust the GPS API /me role and entityId.
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

/**
 * Require an admin-role user for the admin chatbot. When PostgreSQL is
 * configured the role is read from the `users` table (authoritative); otherwise
 * the GPS API /me role is used.
 */
export async function requireAdminAuth(req: NextRequest): Promise<AuthenticatedAdmin | null> {
  const token = getTokenFromRequest(req)
  if (!token) {
    return null
  }

  const sigOk = await verifyJwtSignatureIfConfigured(token)
  if (!sigOk) {
    return null
  }

  const me = await fetchMe(token)

  if (hasPostgres()) {
    const userId = me?.userId ?? getJwtSubject(token)
    if (!userId) {
      return null
    }
    const user = await getUser(userId)
    if (!user || !user.isActive || !(ADMIN_ROLES as readonly string[]).includes(user.role)) {
      return null
    }
    return { userId, role: user.role, name: me?.name ?? user.fullName, token }
  }

  // Legacy path: trust the GPS API /me role.
  if (!me || me.userRole !== "admin") {
    return null
  }
  return { userId: me.userId, role: "admin", name: me.name ?? "Admin", token }
}

export function requireSessionId(req: NextRequest): string {
  const headerSession = req.headers.get("x-session-id")
  if (headerSession?.trim()) {
    return headerSession.trim()
  }
  return crypto.randomUUID()
}
