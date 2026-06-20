import { describe, expect, it } from "vitest"
import { parseChatText } from "@/lib/chatFormatting"

describe("parseChatText", () => {
  it("keeps fintech chat responses structured", () => {
    expect(
      parseChatText(`Eligibility summary

- Stable income required
- FOIR should be within lender limits

Next steps
1. Share income range
2. Compare lender options`),
    ).toEqual([
      { type: "paragraph", text: "Eligibility summary" },
      { type: "bulleted-list", items: ["Stable income required", "FOIR should be within lender limits"] },
      { type: "paragraph", text: "Next steps" },
      { type: "numbered-list", items: ["Share income range", "Compare lender options"] },
    ])
  })

  it("renders markdown-style headings as headings", () => {
    expect(parseChatText("# Loan options")).toEqual([{ type: "heading", text: "Loan options" }])
  })
})
