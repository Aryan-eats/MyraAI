import { getBankWiseStats } from "@/lib/adminDb"

/** Read-only: lead volume and approval rate by assigned bank. */
export async function getBankStats() {
  const stats = await getBankWiseStats()
  return { count: stats.length, banks: stats }
}
