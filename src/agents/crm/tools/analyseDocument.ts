import { analyseDocument as runAnalyser } from "@/lib/documentAnalyser"
import { logDocumentAnalysis } from "@/lib/gpsBridge"
import type { AuthenticatedPartner, DocumentType, LoanProductType } from "@/types/agents"
import { getLenderChecklist } from "@/lib/knowledgeBase"

export async function analyseDocument(args: {
  fileBase64: string
  mimeType: "application/pdf" | "image/jpeg" | "image/png"
  documentType: DocumentType
  lenderName: string
  productType: LoanProductType
  leadId?: string
}, chatUser: AuthenticatedPartner) {
  const checklist = await getLenderChecklist(args.lenderName, args.productType)
  if (!checklist) {
    throw new Error(`Checklist not found for ${args.lenderName} (${args.productType}).`)
  }

  const result = await runAnalyser(
    Buffer.from(args.fileBase64, "base64"),
    args.mimeType,
    args.documentType,
    checklist,
  )

  await logDocumentAnalysis(
    {
      partnerId: chatUser.partnerId,
      leadId: args.leadId,
      documentType: args.documentType,
      overallStatus: result.overallStatus,
      timestamp: new Date().toISOString(),
    },
    {
      token: chatUser.token,
      authPartnerId: chatUser.partnerId,
      targetPartnerId: chatUser.partnerId,
    },
  )

  return result
}
