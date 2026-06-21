import { NextRequest } from "next/server"
import { getChatUser, requirePartnerAuth } from "@/lib/chatAuth"

describe("chatAuth", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
    delete process.env.GPS_JWT_PUBLIC_KEY
  })

  it("returns anonymous user when token is absent", async () => {
    const req = new NextRequest("http://localhost/api/chat")
    const user = await getChatUser(req)
    expect(user.authenticated).toBe(false)
    expect(user.userRole).toBe("anonymous")
  })

  it("returns partner auth when me endpoint confirms partner", async () => {
    process.env.GPS_INDIA_API_URL = "http://gps.local"
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ userId: "u1", userRole: "partner", entityId: "p1", name: "P", tier: "gold" }),
    } as never)

    const req = new NextRequest("http://localhost/api/chat", {
      headers: { authorization: "Bearer test-token" },
    })

    const auth = await requirePartnerAuth(req)
    expect(global.fetch).toHaveBeenCalledWith("http://gps.local/api/auth/me", expect.any(Object))
    expect(auth?.partnerId).toBe("p1")
    expect(auth?.token).toBe("test-token")
  })

  it("normalizes the backend auth user response", async () => {
    process.env.GPS_INDIA_API_URL = "http://gps.local"
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          user: {
            id: "u2",
            role: "admin",
            firstName: "Ada",
            lastName: "Lovelace",
          },
        },
      }),
    } as never)

    const req = new NextRequest("http://localhost/api/chat", {
      headers: { authorization: "Bearer test-token" },
    })

    const user = await getChatUser(req)
    expect(user).toMatchObject({
      authenticated: true,
      userId: "u2",
      userRole: "admin",
      entityId: null,
    })
  })
})
