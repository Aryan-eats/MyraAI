import { appendLeadPartnerNote, fetchPartnerLeadProfile } from "@/lib/gpsBridge"
import { searchLendingKnowledge } from "@/lib/knowledgeBase"
import type { SoftCheckResult } from "@/types/agents"

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function getFoirRisk(foir: number): "low" | "high" | "very_high" {
  if (foir > 0.7) return "very_high"
  if (foir > 0.55) return "high"
  return "low"
}

export async function runSoftCheck(
  leadId: string,
  partnerId: string,
  auth: { token: string },
): Promise<SoftCheckResult> {
  if (process.env.ENABLE_SOFT_CHECK !== "true") {
    // TODO: replace with bureau-backed implementation once CIBIL integration is enabled.
  }

  const lead = await fetchPartnerLeadProfile(leadId, {
    token: auth.token,
    authPartnerId: partnerId,
    targetPartnerId: partnerId,
  })

  let hardDisqualifier: string | undefined
  if (typeof lead.cibilScore === "number" && lead.cibilScore < 600) {
    hardDisqualifier = "CIBIL score below 600"
  } else if (lead.age < 21 || lead.age > 65) {
    hardDisqualifier = "Applicant age outside 21-65"
  } else if (lead.employmentType === "unemployed" || lead.employmentType === "student") {
    hardDisqualifier = `Employment type ${lead.employmentType} is not eligible`
  } else if (lead.hasNpaFlag) {
    hardDisqualifier = "Existing NPA account flag present"
  } else if (lead.duplicateWithin90Days) {
    hardDisqualifier = "Duplicate lead found within 90 days"
  }

  const foirCurrent = lead.monthlyIncome > 0 ? lead.monthlyObligations / lead.monthlyIncome : 1
  const proposedEmi = lead.proposedEmi ?? 0
  const foirProjected = lead.monthlyIncome > 0 ? (lead.monthlyObligations + proposedEmi) / lead.monthlyIncome : 1

  let ltv: SoftCheckResult["ltv"]
  if ((lead.productType === "home_loan" || lead.productType === "lap") && lead.propertyValue) {
    const ratio = lead.requestedLoanAmount / lead.propertyValue
    const threshold = lead.productType === "home_loan" ? 0.75 : 0.6
    ltv = {
      ratio,
      threshold,
      status: ratio > threshold ? "above_limit" : "within_limit",
    }
  }

  const lenderCandidates = await searchLendingKnowledge(lead.productType.replace("_", " "), {
    productType: lead.productType,
    minLoanAmount: lead.requestedLoanAmount,
  })

  const lenderMatches = lenderCandidates.slice(0, 3).map((lender) => {
    const criteriaMet: string[] = []
    const criteriaMissed: string[] = []

    if (!lead.cibilScore || lead.cibilScore >= lender.minCibilScore) {
      criteriaMet.push(`CIBIL threshold (${lender.minCibilScore})`)
    } else {
      criteriaMissed.push(`CIBIL below ${lender.minCibilScore}`)
    }

    if (lead.monthlyIncome >= lender.minMonthlyIncome) {
      criteriaMet.push(`Income threshold (${lender.minMonthlyIncome})`)
    } else {
      criteriaMissed.push(`Income below ${lender.minMonthlyIncome}`)
    }

    if (lead.requestedLoanAmount >= lender.minLoanAmount && lead.requestedLoanAmount <= lender.maxLoanAmount) {
      criteriaMet.push(`Loan amount band (${lender.minLoanAmount}-${lender.maxLoanAmount})`)
    } else {
      criteriaMissed.push("Requested amount outside lender band")
    }

    return {
      lenderName: lender.lenderName,
      confidence: Number((lender.confidence - criteriaMissed.length * 0.08).toFixed(2)),
      criteriaMet,
      criteriaMissed,
    }
  })

  const viable = !hardDisqualifier && foirProjected <= 0.7 && (!ltv || ltv.status === "within_limit")
  const confidence: SoftCheckResult["confidence"] = hardDisqualifier ? "low" : viable ? "high" : "medium"

  const summary = hardDisqualifier
    ? `Lead ${lead.applicantName} is currently unviable due to ${hardDisqualifier}.`
    : `FOIR is ${formatPercent(foirCurrent)} currently and ${formatPercent(foirProjected)} with proposed EMI. ${
        ltv ? `LTV is ${formatPercent(ltv.ratio)}.` : "No LTV check required for this product."
      } Top lender fit: ${lenderMatches[0]?.lenderName ?? "none"}.`

  const suggestedAction = hardDisqualifier
    ? `Decline or park lead: ${hardDisqualifier}`
    : lenderMatches.length
      ? `Proceed and submit to ${lenderMatches
          .filter((m) => m.criteriaMissed.length <= 1)
          .slice(0, 2)
          .map((m) => m.lenderName)
          .join(" + ") || lenderMatches[0].lenderName}`
      : "Collect missing documents and rerun check"

  const result: SoftCheckResult = {
    leadId,
    partnerId,
    hardDisqualifier,
    foir: {
      current: Number(foirCurrent.toFixed(2)),
      projected: Number(foirProjected.toFixed(2)),
      risk: getFoirRisk(foirProjected),
    },
    ltv,
    lenderMatches,
    summary,
    suggestedAction,
    confidence,
    viable,
  }

  await appendLeadPartnerNote(
    {
      leadId,
      note: `Soft-check result: ${summary} Suggested action: ${suggestedAction}`,
      visibility: "partner_only",
    },
    {
      token: auth.token,
      authPartnerId: partnerId,
      targetPartnerId: partnerId,
    },
  )

  return result
}
