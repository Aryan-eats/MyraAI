import { getPartnerLeaderboard } from "@/lib/adminDb"

/**
 * Read-only: partners ranked by disbursals. Optionally filter to one partner by
 * (partial, case-insensitive) name.
 */
export async function getPartnerPerformance(args: { partnerName?: string; limit?: number }) {
  const limit = typeof args.limit === "number" && args.limit > 0 ? Math.min(args.limit, 50) : 10
  const leaderboard = await getPartnerLeaderboard(args.partnerName ? 50 : limit)

  if (args.partnerName?.trim()) {
    const needle = args.partnerName.trim().toLowerCase()
    const matches = leaderboard.filter((p) => p.partnerName.toLowerCase().includes(needle))
    return { filteredBy: args.partnerName.trim(), count: matches.length, partners: matches }
  }

  return { count: leaderboard.length, partners: leaderboard }
}
