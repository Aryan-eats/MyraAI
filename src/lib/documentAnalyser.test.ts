vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          extractedData: {
            aadhaar_number: "123412341234",
            pan_number: "ABCDE1234F",
            account_number: "123456789012",
            issued_date: "2025-01-10",
          },
          issues: [],
          possibleMismatches: [],
        }),
      }),
    }
  },
}))

import { analyseDocument } from "@/lib/documentAnalyser"

describe("analyseDocument", () => {
  it("redacts sensitive values and computes checklist status", async () => {
    const buffer = Buffer.from("sample")

    const result = await analyseDocument(buffer, "application/pdf", "aadhaar", {
      lenderName: "HDFC",
      productType: "personal_loan",
      requiredFields: [
        { field: "aadhaar_number", required: true },
        { field: "pan_number", required: true },
        { field: "missing_field", required: true },
      ],
    })

    expect(result.extractedData.aadhaar_number.endsWith("1234")).toBe(true)
    expect(result.extractedData.pan_number.endsWith("234F")).toBe(true)
    expect(result.checklistStatus.find((x) => x.field === "missing_field")?.status).toBe("missing")
    expect(["incomplete", "resubmit"]).toContain(result.overallStatus)
  })
})
