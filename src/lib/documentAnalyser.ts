import { GoogleGenAI } from "@google/genai"
import type { DocumentAnalysisResult, DocumentType, LenderChecklist } from "@/types/agents"

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

function redactSensitive(field: string, value: string) {
  const normalizedField = field.toLowerCase()
  if (
    normalizedField.includes("aadhaar") ||
    normalizedField.includes("pan") ||
    normalizedField.includes("account")
  ) {
    const clean = value.replace(/\s+/g, "")
    if (clean.length <= 4) {
      return "****"
    }
    return `${"*".repeat(clean.length - 4)}${clean.slice(-4)}`
  }
  return value
}

function safeJsonParse(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    const start = raw.indexOf("{")
    const end = raw.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
      } catch {
        return null
      }
    }
    return null
  }
}

function buildChecklistStatus(
  extractedData: Record<string, string>,
  lenderChecklist: LenderChecklist,
): DocumentAnalysisResult["checklistStatus"] {
  const now = Date.now()

  return lenderChecklist.requiredFields.map((field) => {
    const value = extractedData[field.field]
    if (!field.required) {
      return { field: field.field, required: false, status: "present" as const }
    }

    if (!value) {
      return {
        field: field.field,
        required: true,
        status: "missing" as const,
        note: "Required field not found in document.",
      }
    }

    if (field.maxDocumentAgeDays) {
      const parsedDate = Date.parse(value)
      if (!Number.isNaN(parsedDate)) {
        const ageDays = (now - parsedDate) / (1000 * 60 * 60 * 24)
        if (ageDays > field.maxDocumentAgeDays) {
          return {
            field: field.field,
            required: true,
            status: "expired" as const,
            note: `Older than ${field.maxDocumentAgeDays} days.`,
          }
        }
      }
    }

    if (/illegible/i.test(value)) {
      return {
        field: field.field,
        required: true,
        status: "illegible" as const,
      }
    }

    return {
      field: field.field,
      required: true,
      status: "present" as const,
    }
  })
}

export async function analyseDocument(
  fileBuffer: Buffer,
  mimeType: "application/pdf" | "image/jpeg" | "image/png",
  documentType: DocumentType,
  lenderChecklist: LenderChecklist,
): Promise<DocumentAnalysisResult> {
  const prompt = [
    "You are a loan document analyzer for an Indian lending DSA.",
    `Document type: ${documentType}`,
    "Extract identity, financial, date, signature and stamp fields.",
    "Return strict JSON object with keys:",
    "extractedData (object), issues (string[]), possibleMismatches (string[])",
    "If unreadable, write value as 'illegible'.",
  ].join("\n")

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    config: {
      temperature: 0,
      responseMimeType: "application/json",
    },
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: fileBuffer.toString("base64"),
            },
          },
        ],
      },
    ],
  } as never)

  const raw = (response as { text?: string }).text || "{}"
  const parsed = safeJsonParse(raw) || {}

  const extractedRaw =
    typeof parsed.extractedData === "object" && parsed.extractedData !== null
      ? (parsed.extractedData as Record<string, unknown>)
      : {}

  const extractedData: Record<string, string> = {}
  for (const [key, value] of Object.entries(extractedRaw)) {
    const text = typeof value === "string" ? value.trim() : String(value)
    extractedData[key] = redactSensitive(key, text)
  }

  const checklistStatus = buildChecklistStatus(extractedData, lenderChecklist)
  const issues = [
    ...(Array.isArray(parsed.issues) ? parsed.issues : []),
    ...checklistStatus
      .filter((item) => item.status !== "present")
      .map((item) => `${item.field}: ${item.status}${item.note ? ` (${item.note})` : ""}`),
  ].map((item) => String(item))

  const overallStatus: DocumentAnalysisResult["overallStatus"] = checklistStatus.some((item) => item.status === "illegible")
    ? "resubmit"
    : checklistStatus.some((item) => item.status !== "present")
      ? "incomplete"
      : "complete"

  const partnerNote =
    overallStatus === "complete"
      ? `${documentType} verified against ${lenderChecklist.lenderName} checklist.`
      : `${documentType} has gaps: ${issues.slice(0, 4).join("; ")}`

  return {
    extractedData,
    checklistStatus,
    overallStatus,
    issues,
    partnerNote,
  }
}
