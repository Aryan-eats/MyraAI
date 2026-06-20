import { answerLoanQuestion } from "@/lib/loanAnswering"
import type { KnowledgeFilters } from "@/types/agents"

export type SearchKnowledgeArgs = {
  loanType?: string
  bankCode?: string
  query?: string
}

/**
 * Customer chatbot knowledge tool.
 *
 * Reads the GPS India PostgreSQL loan database first. When the database has no
 * usable match, falls back to Firecrawl web search and returns an explicit
 * marking so the model must disclose the source.
 */
export async function searchKnowledge(args: SearchKnowledgeArgs | string, filters?: KnowledgeFilters) {
  void filters
  const result = await answerLoanQuestion(args)
  return { source: result.source, marking: result.marking, ...result.data }
}
