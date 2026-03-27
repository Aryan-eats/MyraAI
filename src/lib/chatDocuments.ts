import { deleteJson, getJson, setJson } from "@/lib/chatCache"

const SESSION_DOCUMENT_TTL_SECONDS = 60 * 60 * 2

export type SessionDocumentContext<TDocument extends Record<string, unknown> = Record<string, unknown>> = {
  mode: string
  sessionId: string
  document: TDocument
}

function buildSessionDocumentKey(mode: string, sessionId: string) {
  return `chat:document:${mode}:${sessionId}`
}

export async function setSessionDocumentContext<TDocument extends Record<string, unknown>>(
  input: SessionDocumentContext<TDocument>,
): Promise<void> {
  await setJson(buildSessionDocumentKey(input.mode, input.sessionId), input.document, SESSION_DOCUMENT_TTL_SECONDS)
}

export async function getSessionDocumentContext<TDocument extends Record<string, unknown>>(
  input: Pick<SessionDocumentContext<TDocument>, "mode" | "sessionId">,
): Promise<SessionDocumentContext<TDocument> | null> {
  const document = await getJson<TDocument>(buildSessionDocumentKey(input.mode, input.sessionId))
  if (!document) {
    return null
  }

  return {
    mode: input.mode,
    sessionId: input.sessionId,
    document,
  }
}

export async function clearSessionDocumentContext(
  input: Pick<SessionDocumentContext, "mode" | "sessionId">,
): Promise<void> {
  await deleteJson(buildSessionDocumentKey(input.mode, input.sessionId))
}
