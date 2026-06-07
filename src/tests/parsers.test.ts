import { describe, expect, it, vi, afterEach } from "vitest"
import { parseFile, parseUrl } from "@/lib/parsers"

describe("parseFile", () => {
  it("returns plain text for txt files", async () => {
    const result = await parseFile(Buffer.from("hello world"), "notes.txt")

    expect(result).toEqual({ text: "hello world", name: "notes.txt" })
  })

  it("rejects unsupported file types", async () => {
    await expect(parseFile(Buffer.from("data"), "notes.exe")).rejects.toThrow(
      "Unsupported file type: .exe. Supported: txt, md, csv, pdf, docx",
    )
  })
})

describe("parseUrl", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it("strips non-content elements from HTML", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        "<html><head><style>body{}</style></head><body><header>Nav</header><main>Hello <script>bad()</script>world</main><footer>Foot</footer></body></html>",
    } as never)

    const result = await parseUrl("https://example.com/help")

    expect(result.name).toBe("example.com")
    expect(result.text).toContain("Hello world")
    expect(result.text).not.toContain("bad()")
    expect(result.text).not.toContain("Nav")
    expect(result.text).not.toContain("Foot")
  })
})
