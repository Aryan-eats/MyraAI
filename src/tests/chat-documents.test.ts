import { vi } from "vitest"

const documentStore = new Map<string, unknown>()

vi.mock("@/lib/chatCache", () => ({
  getJson: vi.fn(async (key: string) => documentStore.get(key) ?? null),
  setJson: vi.fn(async (key: string, value: unknown) => {
    documentStore.set(key, value)
  }),
  deleteJson: vi.fn(async (key: string) => {
    documentStore.delete(key)
  }),
}))

import { deleteJson, getJson, setJson } from "@/lib/chatCache"
import {
  clearSessionDocumentContext,
  getSessionDocumentContext,
  setSessionDocumentContext,
} from "@/lib/chatDocuments"

describe("chatDocuments", () => {
  it("stores and retrieves one active document per mode and session", async () => {
    await setSessionDocumentContext({
      mode: "web",
      sessionId: "session_1",
      document: { documentId: "doc_web_1", title: "Web doc v1" },
    })
    await setSessionDocumentContext({
      mode: "crm",
      sessionId: "session_1",
      document: { documentId: "doc_crm_1", title: "CRM doc v1" },
    })
    await setSessionDocumentContext({
      mode: "web",
      sessionId: "session_1",
      document: { documentId: "doc_web_2", title: "Web doc v2" },
    })

    const webDoc = await getSessionDocumentContext({ mode: "web", sessionId: "session_1" })
    const crmDoc = await getSessionDocumentContext({ mode: "crm", sessionId: "session_1" })

    expect(webDoc?.document.documentId).toBe("doc_web_2")
    expect(crmDoc?.document.documentId).toBe("doc_crm_1")
    expect(setJson).toHaveBeenCalledWith(
      "chat:document:web:session_1",
      { documentId: "doc_web_2", title: "Web doc v2" },
      7200,
    )
    expect(setJson).toHaveBeenCalledWith(
      "chat:document:crm:session_1",
      { documentId: "doc_crm_1", title: "CRM doc v1" },
      7200,
    )

    await clearSessionDocumentContext({ mode: "web", sessionId: "session_1" })
    expect(deleteJson).toHaveBeenCalledWith("chat:document:web:session_1")
    expect(await getSessionDocumentContext({ mode: "web", sessionId: "session_1" })).toBeNull()
  })
})
