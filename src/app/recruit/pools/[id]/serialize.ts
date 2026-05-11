/**
 * Pool detail serialization — single source of truth for transforming
 * Drizzle query results into client-safe props for the pool detail page.
 */

import type { Pool, PoolCriteria } from "@/db/schema/pools";
import type { PoolMember } from "@/db/schema/pools";
import type { Candidate } from "@/db/schema/candidates";
import type { Role } from "@/db/schema/roles";

// -- Serialized types -----------------------------------------------------

export interface SerializedPoolMember {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateTitle: string | null;
  candidateCompany: string | null;
  candidateLocation: string | null;
  candidateTalentScore: number | null;
  addedAt: string;
}

export interface SerializedPoolDetail {
  id: string;
  name: string;
  description: string | null;
  criteria: PoolCriteria | null;
  health: string;
  candidateCount: number;
  matchingRoles: Array<{ id: string; title: string }>;
  topSignal: string | null;
  lastUpdated: string | null;
  createdAt: string;
  members: SerializedPoolMember[];
}

export interface PoolDetailPageProps {
  pool: SerializedPoolDetail;
}

// -- Helpers --------------------------------------------------------------

function serializeDate(d: Date | string | null): string {
  if (!d) return "";
  return d instanceof Date ? d.toISOString() : String(d);
}

function formatRelativeDate(d: Date | string | null): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  return `${Math.floor(diffDays / 7)} weeks ago`;
}

// -- Main serializer -----------------------------------------------------

type PoolWithMembers = Pool & {
  members?: Array<PoolMember & { candidate?: Candidate | null }>;
};

export function serializePoolDetail(
  pool: PoolWithMembers,
  roleMap: Record<string, string>,
): PoolDetailPageProps {
  const matchingRoleIds = (pool.matchingRoleIds as string[]) ?? [];
  const matchingRoles = matchingRoleIds
    .map((id) => (roleMap[id] ? { id, title: roleMap[id] } : null))
    .filter((r): r is { id: string; title: string } => r !== null);

  const members: SerializedPoolMember[] = (pool.members ?? [])
    .filter((m) => m.candidate)
    .map((m) => ({
      id: m.id,
      candidateId: m.candidateId,
      candidateName: m.candidate!.name,
      candidateTitle: m.candidate!.title,
      candidateCompany: m.candidate!.company,
      candidateLocation: m.candidate!.location,
      candidateTalentScore: m.candidate!.talentScore,
      addedAt: serializeDate(m.createdAt),
    }));

  return {
    pool: {
      id: pool.id,
      name: pool.name,
      description: pool.description,
      criteria: pool.criteria as PoolCriteria | null,
      health: pool.health ?? "active",
      candidateCount: members.length,
      matchingRoles,
      topSignal: pool.topSignal,
      lastUpdated: formatRelativeDate(pool.lastUpdated),
      createdAt: serializeDate(pool.createdAt),
      members,
    },
  };
}

/**
 * Build a map of role ID → role title from roles array.
 */
export function buildRoleMap(roles: Pick<Role, "id" | "title">[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const role of roles) {
    map[role.id] = role.title;
  }
  return map;
}
