/**
 * Pools list serialization — single source of truth for transforming
 * Drizzle query results into client-safe props for the pools list page.
 *
 * Types flow from: DB schema ($inferSelect) → serialize → client component.
 * No manual interfaces in the client — import from here.
 */

import type { Pool, PoolCriteria } from "@/db/schema/pools";
import type { PoolMember } from "@/db/schema/pools";
import type { Role } from "@/db/schema/roles";

// Pool with members relation
type PoolWithMembers = Pool & { members?: PoolMember[] };

// -- Serialized pool for the list page ------------------------------------

export interface SerializedPool {
  id: string;
  name: string;
  description: string | null;
  criteria: PoolCriteria | null;
  health: string;
  candidateCount: number;
  newThisWeek: number;
  matchingRoles: string[]; // Role titles, not IDs
  topSignal: string | null;
  lastUpdated: string | null;
}

export interface PoolsPageProps {
  pools: SerializedPool[];
  total: number;
}

// -- Helpers --------------------------------------------------------------

function serializeDate(d: Date | string | null): string | null {
  if (!d) return null;
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

function serializePool(
  pool: PoolWithMembers,
  roleMap: Record<string, string>, // roleId → roleTitle
  newThisWeek: number = 0,
): SerializedPool {
  const matchingRoleIds = (pool.matchingRoleIds as string[]) ?? [];
  const matchingRoles = matchingRoleIds
    .map((id) => roleMap[id])
    .filter(Boolean);

  // Use actual member count from relation, fallback to candidateCount field
  const actualMemberCount = pool.members?.length ?? pool.candidateCount ?? 0;

  return {
    id: pool.id,
    name: pool.name,
    description: pool.description,
    criteria: pool.criteria as PoolCriteria | null,
    health: pool.health ?? "active",
    candidateCount: actualMemberCount,
    newThisWeek,
    matchingRoles,
    topSignal: pool.topSignal,
    lastUpdated: formatRelativeDate(pool.lastUpdated),
  };
}

export function serializePoolsList(
  pools: PoolWithMembers[],
  roleMap: Record<string, string>,
  newMembersMap: Record<string, number>,
): SerializedPool[] {
  return pools.map((p) =>
    serializePool(p, roleMap, newMembersMap[p.id] ?? 0)
  );
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
