import { searchLendingKnowledge } from "@/lib/knowledgeBase"
import type { KnowledgeFilters } from "@/types/agents"

export async function searchKnowledge(query: string, filters?: KnowledgeFilters) {
  const matches = await searchLendingKnowledge(query, filters)
  return {
    matches,
    count: matches.length,
  }
}
