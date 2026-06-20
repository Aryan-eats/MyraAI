import { getPlatformSummary } from "@/lib/adminDb"

/** Read-only: platform-wide totals across all partners. */
export async function getPlatformOverview() {
  return getPlatformSummary()
}
