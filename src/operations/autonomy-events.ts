/**
 * Skill autonomy event log — operations.
 *
 * Append-only ledger of autonomy ladder transitions. Writes are owned by
 * `recomputeSkillAutonomy()` (see B12 extension in `skill-autonomy.ts`);
 * reads serve `/me` and skill-detail UIs.
 */

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  skillAutonomyEvents,
  type SkillAutonomyDirection,
  type SkillAutonomyEvent,
} from "@/db/schema/skill-autonomy-events";

export interface RecordAutonomyEventInput {
  organizationId: string;
  skillId: string;
  projectId: string | null;
  direction: SkillAutonomyDirection;
  fromLevel: number;
  toLevel: number;
  reason: string;
  triggeringOutcomeIds: string[];
}

/**
 * Append one autonomy event. Caller is `recomputeSkillAutonomy()`, which
 * computes the level transition and gathers the trailing-window outcome
 * IDs that drove it.
 */
export async function recordAutonomyEvent(
  input: RecordAutonomyEventInput,
): Promise<SkillAutonomyEvent> {
  const [row] = await db
    .insert(skillAutonomyEvents)
    .values({
      organizationId: input.organizationId,
      skillId: input.skillId,
      projectId: input.projectId,
      direction: input.direction,
      fromLevel: input.fromLevel,
      toLevel: input.toLevel,
      reason: input.reason,
      triggeringOutcomeIds: input.triggeringOutcomeIds,
    })
    .returning();
  return row;
}

/**
 * Recent autonomy events for one skill, optionally narrowed to a single
 * project. Ordered newest-first. Used by the skill detail page heatmap
 * and the `/me` per-project autonomy path-to-next surface.
 */
export async function listAutonomyEventsForSkill(
  skillId: string,
  options: { projectId?: string | null; limit?: number; sinceDays?: number } = {},
): Promise<SkillAutonomyEvent[]> {
  const { limit = 50, sinceDays } = options;
  const filters = [eq(skillAutonomyEvents.skillId, skillId)];
  if (options.projectId !== undefined) {
    filters.push(
      options.projectId === null
        ? sql`${skillAutonomyEvents.projectId} is null`
        : eq(skillAutonomyEvents.projectId, options.projectId),
    );
  }
  if (sinceDays) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    filters.push(gte(skillAutonomyEvents.createdAt, since));
  }
  return db
    .select()
    .from(skillAutonomyEvents)
    .where(and(...filters))
    .orderBy(desc(skillAutonomyEvents.createdAt))
    .limit(limit);
}

/**
 * Recent autonomy events for an entire project. Used by the project detail
 * page to show "what's changed about who can act here in the last N days."
 */
export async function listAutonomyEventsForProject(
  projectId: string,
  options: { limit?: number; sinceDays?: number } = {},
): Promise<SkillAutonomyEvent[]> {
  const { limit = 100, sinceDays = 30 } = options;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(skillAutonomyEvents)
    .where(
      and(
        eq(skillAutonomyEvents.projectId, projectId),
        gte(skillAutonomyEvents.createdAt, since),
      ),
    )
    .orderBy(desc(skillAutonomyEvents.createdAt))
    .limit(limit);
}

/**
 * Recent autonomy events org-wide. Used by `/me` to surface "skills you
 * contribute to were promoted/demoted recently" — the personal change
 * feed. Filtering by user is left to the caller; this returns the
 * org-scoped raw list.
 */
export async function listAutonomyEventsForOrg(
  organizationId: string,
  options: { limit?: number; sinceDays?: number; skillIds?: string[] } = {},
): Promise<SkillAutonomyEvent[]> {
  const { limit = 50, sinceDays = 14 } = options;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const filters = [
    eq(skillAutonomyEvents.organizationId, organizationId),
    gte(skillAutonomyEvents.createdAt, since),
  ];
  if (options.skillIds && options.skillIds.length > 0) {
    filters.push(inArray(skillAutonomyEvents.skillId, options.skillIds));
  }
  return db
    .select()
    .from(skillAutonomyEvents)
    .where(and(...filters))
    .orderBy(desc(skillAutonomyEvents.createdAt))
    .limit(limit);
}
