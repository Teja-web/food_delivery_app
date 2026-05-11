import { createEntityCrud } from "@/lib/crud";
import { db } from "@/db/client";
import { pools, poolMembers, candidates } from "@/db/schema";
import { eq, gte, desc, sql } from "drizzle-orm";
import { poolSchema, poolMemberSchema } from "./schemas";
import { safeRevalidate } from "@/lib/safe-revalidate";

// -- Pools -------------------------------------------------------------

const poolCrud = createEntityCrud({
  db,
  table: pools,
  queryKey: "pools",
  idField: "id",
  schema: poolSchema,
  onMutate: () => safeRevalidate("/pools"),
  getWith: { members: true },
  searchFields: ["name", "description"],
});

export const getPools = poolCrud.list;
export const searchPools = poolCrud.search;
export const getPool = poolCrud.get;
export const createPool = poolCrud.create;
export const updatePool = poolCrud.update;
export const deletePool = poolCrud.delete;

/**
 * Get new member counts per pool for the last 7 days.
 */
export async function getPoolNewMemberCounts(organizationId: string) {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const results = await db
    .select({
      poolId: poolMembers.poolId,
      count: sql<number>`count(*)::int`,
    })
    .from(poolMembers)
    .where(gte(poolMembers.createdAt, oneWeekAgo))
    .groupBy(poolMembers.poolId);

  const map: Record<string, number> = {};
  for (const row of results) {
    map[row.poolId] = row.count;
  }
  return map;
}

/**
 * Get pool with members for detail page.
 */
export async function getPoolDetail(id: string) {
  return poolCrud.get(id, {
    with: {
      members: {
        with: {
          candidate: true,
        },
      },
    },
  });
}

// -- Pool Members ------------------------------------------------------

const poolMemberCrud = createEntityCrud({
  db,
  table: poolMembers,
  queryKey: "poolMembers",
  idField: "id",
  schema: poolMemberSchema,
  onMutate: () => safeRevalidate("/pools"),
  getWith: { pool: true, candidate: true },
});

const getPoolMembers = poolMemberCrud.list;
const getPoolMember = poolMemberCrud.get;
const createPoolMember = poolMemberCrud.create;
const updatePoolMember = poolMemberCrud.update;
const deletePoolMember = poolMemberCrud.delete;

/**
 * Get members of a specific pool with candidate details.
 */
async function getPoolMembersByPoolId(
  poolId: string,
  options: { limit?: number; offset?: number } = {}
) {
  const { limit = 20, offset = 0 } = options;

  const items = await db
    .select({
      id: poolMembers.id,
      poolId: poolMembers.poolId,
      candidateId: poolMembers.candidateId,
      createdAt: poolMembers.createdAt,
      candidate: {
        id: candidates.id,
        name: candidates.name,
        email: candidates.email,
        talentScore: candidates.talentScore,
        location: candidates.location,
      },
    })
    .from(poolMembers)
    .innerJoin(candidates, eq(poolMembers.candidateId, candidates.id))
    .where(eq(poolMembers.poolId, poolId))
    .orderBy(desc(candidates.talentScore))
    .limit(limit)
    .offset(offset);

  return { items, total: items.length };
}
