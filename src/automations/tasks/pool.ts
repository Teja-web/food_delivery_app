/**
 * pool.intake — Analyze pool to extract criteria, match roles, and generate insights.
 * pool.evaluateCandidatesForPool — Auto-add existing candidates to a new pool.
 * pool.evaluatePoolsForCandidate — Auto-add candidate to matching pools.
 * pool.updateMatchingRoles — Update pools when a new role is added.
 */

import { db } from "@/db/client";
import { pools, poolMembers, roles, candidates, orgCandidates } from "@/db/schema";
import { eq, and, gte, sql, ne, exists } from "drizzle-orm";
import { poolInsightAnalyzerPromptWithContext } from "../agents/prompts/pool-insight-analyzer";
import { poolInsightAnalyzerAgent, poolInsightAnalyzerSchema } from "../agents/definitions/pool-insight-analyzer";
import { poolCandidateMatcherPromptWithContext } from "../agents/prompts/pool-candidate-matcher";
import { poolCandidateMatcherAgent, poolCandidateMatcherSchema } from "../agents/definitions/pool-candidate-matcher";
import { generate } from "@/lib/ai";

export async function poolIntake(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId } = params;

  // Fetch the pool
  const pool = await db.query.pools.findFirst({
    where: eq(pools.id, entityId),
  });
  if (!pool) return { skipped: true, reason: "pool_not_found" };
  if (!pool.name) return { skipped: true, reason: "no_pool_name" };

  // Fetch open roles for matching
  const openRoles = await db.query.roles.findMany({
    where: and(
      eq(roles.organizationId, organizationId),
      eq(roles.status, "open")
    ),
  });

  // Count current members
  const memberCountResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMembers)
    .where(eq(poolMembers.poolId, entityId));
  const memberCount = memberCountResult[0]?.count ?? 0;

  // Count new members this week
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const newMembersResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMembers)
    .where(and(
      eq(poolMembers.poolId, entityId),
      gte(poolMembers.createdAt, oneWeekAgo)
    ));
  const newMembersThisWeek = newMembersResult[0]?.count ?? 0;

  // Build prompt with context
  const prompt = poolInsightAnalyzerPromptWithContext({
    poolName: pool.name,
    poolDescription: pool.description ?? "",
    openRoles: openRoles.map(r => ({
      id: r.id,
      title: r.title,
      team: r.team ?? undefined,
      criteria: r.criteriaConfig,
    })),
    memberCount,
    newMembersThisWeek,
  });

  // Generate insights
  const result = await generate({
    agent: poolInsightAnalyzerAgent,
    prompt,
    output: poolInsightAnalyzerSchema
  });
  const insight = (result as any).object as typeof poolInsightAnalyzerSchema._output;

  // Update pool with AI-generated data
  await db
    .update(pools)
    .set({
      criteria: insight.criteria,
      matchingRoleIds: insight.matchingRoleIds,
      topSignal: insight.topSignal,
      health: insight.health,
      candidateCount: memberCount,
      lastUpdated: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(pools.id, entityId));

  return {
    success: true,
    criteria: insight.criteria,
    matchingRoleIds: insight.matchingRoleIds,
    topSignal: insight.topSignal,
    health: insight.health,
  };
}

/**
 * Refresh pool stats and regenerate insight when membership changes.
 */
export async function poolRefreshStats(params: {
  organizationId: string;
  entityId: string; // This is the pool_member ID
  traceId?: string;
}) {
  const { organizationId, entityId } = params;

  // Get the pool member to find the pool ID
  const member = await db.query.poolMembers.findFirst({
    where: eq(poolMembers.id, entityId),
  });
  if (!member) return { skipped: true, reason: "member_not_found" };

  // Delegate to poolIntake with the pool ID
  return poolIntake({
    organizationId,
    entityId: member.poolId,
    traceId: params.traceId,
  });
}

/**
 * Evaluate a new candidate against all pools and auto-add to matching ones.
 */
export async function evaluatePoolsForCandidate(params: {
  organizationId: string;
  entityId: string; // candidate ID
  traceId?: string;
}) {
  const { organizationId, entityId } = params;

  // Fetch the candidate
  const candidate = await db.query.candidates.findFirst({
    where: eq(candidates.id, entityId),
  });
  if (!candidate) return { skipped: true, reason: "candidate_not_found" };
  if (candidate.status !== "active") return { skipped: true, reason: "candidate_inactive" };

  // Fetch all pools with criteria
  const allPools = await db.query.pools.findMany({
    where: eq(pools.organizationId, organizationId),
  });

  const poolsWithCriteria = allPools.filter(p => p.criteria);
  if (poolsWithCriteria.length === 0) {
    return { skipped: true, reason: "no_pools_with_criteria" };
  }

  // Build candidate profile for matching
  const candidateProfile = {
    name: candidate.name,
    title: candidate.title,
    company: candidate.company,
    location: candidate.location,
    skills: candidate.skills ?? [],
    experience: candidate.experience ?? [],
    summary: (candidate.profile as any)?.summary ?? candidate.resumeText?.slice(0, 500),
  };

  // Use AI to determine which pools match
  const prompt = poolCandidateMatcherPromptWithContext({
    candidate: candidateProfile,
    pools: poolsWithCriteria.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      criteria: p.criteria as any,
    })),
  });

  const result = await generate({
    agent: poolCandidateMatcherAgent,
    prompt,
    output: poolCandidateMatcherSchema,
  });
  const matches = (result as any).object as typeof poolCandidateMatcherSchema._output;

  // Add candidate to matching pools
  const addedTo: string[] = [];
  for (const match of matches.matchingPools) {
    if (match.shouldAdd) {
      // Check if already a member
      const existing = await db.query.poolMembers.findFirst({
        where: and(
          eq(poolMembers.poolId, match.poolId),
          eq(poolMembers.candidateId, entityId)
        ),
      });

      if (!existing) {
        await db.insert(poolMembers).values({
          organizationId,
          poolId: match.poolId,
          candidateId: entityId,
          addedBy: "system",
        });
        addedTo.push(match.poolId);
      }
    }
  }

  return { success: true, addedToPools: addedTo };
}

/**
 * Evaluate all existing candidates against a new pool and auto-add matches.
 */
export async function evaluateCandidatesForPool(params: {
  organizationId: string;
  entityId: string; // pool ID
  traceId?: string;
}) {
  const { organizationId, entityId } = params;

  // Fetch the pool
  const pool = await db.query.pools.findFirst({
    where: eq(pools.id, entityId),
  });
  if (!pool) return { skipped: true, reason: "pool_not_found" };
  if (!pool.criteria) return { skipped: true, reason: "no_criteria_yet" };

  // Fetch every candidate visible to this org via org_candidates membership.
  // (Phase 1: replaces the prior creator-stamp + PLATFORM_ORG_ID OR.)
  const allCandidates = await db.query.candidates.findMany({
    where: and(
      exists(
        db.select({ one: sql`1` }).from(orgCandidates).where(and(
          eq(orgCandidates.candidateId, candidates.id),
          eq(orgCandidates.organizationId, organizationId),
        )),
      ),
      eq(candidates.status, "active"),
    ),
  });

  if (allCandidates.length === 0) {
    return { skipped: true, reason: "no_candidates" };
  }

  // Process in batches of 10 to avoid huge prompts
  const BATCH_SIZE = 10;
  const addedCandidates: string[] = [];
  const removedCandidates: string[] = [];

  for (let i = 0; i < allCandidates.length; i += BATCH_SIZE) {
    const batch = allCandidates.slice(i, i + BATCH_SIZE);

    // For each candidate in batch, check if they match
    for (const candidate of batch) {
      const existing = await db.query.poolMembers.findFirst({
        where: and(
          eq(poolMembers.poolId, entityId),
          eq(poolMembers.candidateId, candidate.id)
        ),
      });

      // Skip manually added members — only re-evaluate system-added ones
      if (existing && existing.addedBy !== "system") continue;

      // Build candidate profile
      const candidateProfile = {
        name: candidate.name,
        title: candidate.title,
        company: candidate.company,
        location: candidate.location,
        skills: candidate.skills ?? [],
        experience: candidate.experience ?? [],
        summary: (candidate.profile as any)?.summary ?? candidate.resumeText?.slice(0, 500),
      };

      // Use AI to determine if candidate matches this pool
      const prompt = poolCandidateMatcherPromptWithContext({
        candidate: candidateProfile,
        pools: [{
          id: pool.id,
          name: pool.name,
          description: pool.description ?? "",
          criteria: pool.criteria as any,
        }],
      });

      try {
        const result = await generate({
          agent: poolCandidateMatcherAgent,
          prompt,
          output: poolCandidateMatcherSchema,
        });
        const matches = (result as any).object as typeof poolCandidateMatcherSchema._output;

        const match = matches.matchingPools.find(m => m.poolId === entityId);
        if (match?.shouldAdd) {
          if (!existing) {
            await db.insert(poolMembers).values({
              organizationId,
              poolId: entityId,
              candidateId: candidate.id,
              addedBy: "system",
            });
            addedCandidates.push(candidate.id);
          }
        } else if (existing) {
          // No longer matches — remove from pool
          await db
            .delete(poolMembers)
            .where(eq(poolMembers.id, existing.id));
          removedCandidates.push(candidate.id);
        }
      } catch (err) {
        console.error(`Failed to evaluate candidate ${candidate.id} for pool ${entityId}:`, err);
      }
    }
  }

  return { success: true, addedCandidates, removedCandidates, addedCount: addedCandidates.length, removedCount: removedCandidates.length };
}

/**
 * Update all pools' matchingRoleIds when a new role is added.
 */
export async function updatePoolsMatchingRoles(params: {
  organizationId: string;
  entityId: string; // role ID
  traceId?: string;
}) {
  const { organizationId, entityId } = params;

  // Fetch all pools - we need to re-evaluate their matchingRoleIds
  const allPools = await db.query.pools.findMany({
    where: eq(pools.organizationId, organizationId),
  });

  if (allPools.length === 0) {
    return { skipped: true, reason: "no_pools" };
  }

  // Re-run poolIntake for each pool to update matchingRoleIds
  const updated: string[] = [];
  for (const pool of allPools) {
    try {
      await poolIntake({
        organizationId,
        entityId: pool.id,
        traceId: params.traceId,
      });
      updated.push(pool.id);
    } catch (err) {
      console.error(`Failed to update pool ${pool.id}:`, err);
    }
  }

  return { success: true, updatedPools: updated };
}
