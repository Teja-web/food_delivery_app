/**
 * Entity-specific hybrid search wrappers.
 */

import { db } from "@/db/client";
import { searchHybrid } from "@/lib/search";
import type { SearchOptions } from "@/lib/search";
import { candidates } from "@/db/schema/candidates";
import { roles } from "@/db/schema/roles";
import { interviews } from "@/db/schema/interviews";
import { inArray } from "drizzle-orm";

export interface EntitySearchResult {
  entityType: string;
  id: string;
  title: string;
  subtitle?: string;
  score: number;
}

export async function searchCandidates(
  query: string,
  organizationId: string,
  limit?: number,
): Promise<EntitySearchResult[]> {
  const hits = await searchHybrid(db, query, "candidates", {
    organizationId,
    limit: limit ?? 20,
  });
  if (hits.length === 0) return [];
  const ids = hits.map((h) => h.record.id);
  const rows = await db.select({ id: candidates.id, name: candidates.name, email: candidates.email }).from(candidates).where(inArray(candidates.id, ids));
  const lookup = new Map(rows.map((r) => [r.id, r]));
  return hits.map((h) => {
    const row = lookup.get(h.record.id);
    return {
      entityType: "candidate",
      id: h.record.id,
      title: row?.name ?? "Unknown candidate",
      subtitle: row?.email ?? undefined,
      score: h.score,
    };
  });
}

export async function searchRoles(
  query: string,
  organizationId: string,
  limit?: number,
): Promise<EntitySearchResult[]> {
  const hits = await searchHybrid(db, query, "roles", {
    organizationId,
    limit: limit ?? 20,
  });
  if (hits.length === 0) return [];
  const ids = hits.map((h) => h.record.id);
  const rows = await db.select({ id: roles.id, title: roles.title, team: roles.team }).from(roles).where(inArray(roles.id, ids));
  const lookup = new Map(rows.map((r) => [r.id, r]));
  return hits.map((h) => {
    const row = lookup.get(h.record.id);
    return {
      entityType: "role",
      id: h.record.id,
      title: row?.title ?? "Unknown role",
      subtitle: row?.team ?? undefined,
      score: h.score,
    };
  });
}

export async function searchInterviews(
  query: string,
  organizationId: string,
  limit?: number,
): Promise<EntitySearchResult[]> {
  const hits = await searchHybrid(db, query, "interviews", {
    organizationId,
    limit: limit ?? 20,
  });
  if (hits.length === 0) return [];
  const ids = hits.map((h) => h.record.id);
  const rows = await db.select({ id: interviews.id, interviewType: interviews.interviewType }).from(interviews).where(inArray(interviews.id, ids));
  const lookup = new Map(rows.map((r) => [r.id, r]));
  return hits.map((h) => {
    const row = lookup.get(h.record.id);
    return {
      entityType: "interview",
      id: h.record.id,
      title: row?.interviewType ?? "Interview",
      score: h.score,
    };
  });
}
