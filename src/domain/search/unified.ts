/**
 * Unified search — searches all entity types in parallel, merges by score.
 */

import { searchCandidates, searchRoles, searchInterviews } from "./index";
import type { EntitySearchResult } from "./index";

export async function searchAll(
  query: string,
  organizationId: string,
  limit: number = 10,
): Promise<EntitySearchResult[]> {
  const [candidateResults, roleResults, interviewResults] = await Promise.all([
    searchCandidates(query, organizationId, limit),
    searchRoles(query, organizationId, limit),
    searchInterviews(query, organizationId, limit),
  ]);

  return [...candidateResults, ...roleResults, ...interviewResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
