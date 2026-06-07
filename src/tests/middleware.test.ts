import { describe, expect, it, vi } from "vitest"
import { proxy } from "@/proxy"

vi.mock("@/lib/getSession", () => ({
  getSession: vi.fn(),
}))

import { getSession } from "@/lib/getSession"

describe("middleware", () => {
  it("redirects unauthenticated dashboard requests to login", async () => {
    vi.mocked(getSession).mockResolvedValue(null)
    const response = await proxy()

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toContain("/login")
  })

  it("allows dashboard requests with a session", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "owner_1" } } as never)
    const response = await proxy()

    expect(response.status).toBe(200)
  })
})
