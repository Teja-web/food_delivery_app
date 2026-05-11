"use server";

import { getActionContext } from "@/lib/auth/context";
import { searchAll } from "@/domain/search/unified";
import { searchCandidates, searchRoles, searchInterviews } from "@/domain/search";
import type { EntitySearchResult } from "@/domain/search";

export async function globalSearch(query: string, limit?: number): Promise<EntitySearchResult[]> {
  const ctx = await getActionContext();
  return searchAll(query, ctx.organizationId, limit);
}

async function searchCandidatesAction(query: string, limit?: number): Promise<EntitySearchResult[]> {
  const ctx = await getActionContext();
  return searchCandidates(query, ctx.organizationId, limit);
}

async function searchRolesAction(query: string, limit?: number): Promise<EntitySearchResult[]> {
  const ctx = await getActionContext();
  return searchRoles(query, ctx.organizationId, limit);
}

async function searchInterviewsAction(query: string, limit?: number): Promise<EntitySearchResult[]> {
  const ctx = await getActionContext();
  return searchInterviews(query, ctx.organizationId, limit);
}
