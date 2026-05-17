/**
 * Per-project trust surface — composes the data behind the cockpit
 * Trust tab (P1.5 + P1.7 in the UI audit). Two helpers:
 *
 *   - `getRecentProjectOutcomes(projectId, limit)` — recent skill_outcomes
 *     filtered to this project, joined with the skill name.
 *   - `getProjectAutonomyPolicyMatrix(orgId, projectId)` — resolves the
 *     full (actionKind × changeRisk) matrix to {minLevel, source, ruleId}
 *     so operators can see *which* policy is active without grepping rules.
 */

import { and, desc, eq, or, like } from "drizzle-orm";

import { db } from "@/db/client";
import { approvals, type ApprovalStatus } from "@/db/schema/approval";
import { projects } from "@/db/schema/project";
import { skillOutcomes, type SkillOutcomeSeverity, type SkillOutcomeVerdict } from "@/db/schema/skill-outcome";
import { skills } from "@/db/schema/skill";
import {
  resolveAutonomyThreshold,
  type ResolvedAutonomyThreshold,
} from "@/operations/autonomy-policy";
import {
  ACTION_KINDS,
  CHANGE_RISKS,
  type ActionKind,
  type ChangeRiskLabel,
} from "@/lib/rule-validators/autonomy-threshold";

export interface ProjectOutcomeRow {
  id: string;
  recordedAt: Date;
  verdict: SkillOutcomeVerdict;
  severity: SkillOutcomeSeverity | null;
  skillId: string | null;
  skillSlug: string | null;
  skillName: string | null;
  sourceKind: string | null;
  sourceRef: string | null;
}

export async function getRecentProjectOutcomes(
  projectId: string,
  limit = 30,
): Promise<ProjectOutcomeRow[]> {
  const rows = await db
    .select({
      id: skillOutcomes.id,
      recordedAt: skillOutcomes.recordedAt,
      verdict: skillOutcomes.verdict,
      severity: skillOutcomes.severity,
      skillId: skillOutcomes.skillId,
      skillSlug: skills.slug,
      skillName: skills.name,
      sourceKind: skillOutcomes.sourceKind,
      sourceRef: skillOutcomes.sourceRef,
    })
    .from(skillOutcomes)
    .leftJoin(skills, eq(skills.id, skillOutcomes.skillId))
    .where(eq(skillOutcomes.projectId, projectId))
    .orderBy(desc(skillOutcomes.recordedAt))
    .limit(limit);
  return rows;
}

export interface PolicyMatrixCell {
  actionKind: ActionKind;
  changeRisk: ChangeRiskLabel;
  minLevel: number;
  /** `null` → never auto (`Infinity` collapsed to null on the wire). */
  minLevelDisplay: "observe" | "propose" | "merge" | "lead" | "never";
  source: ResolvedAutonomyThreshold["source"];
  enforcedByRuleId: string | null;
}

const LEVEL_LABEL: ["observe", "propose", "merge", "lead"] = [
  "observe",
  "propose",
  "merge",
  "lead",
];

function levelDisplay(level: number): PolicyMatrixCell["minLevelDisplay"] {
  if (!Number.isFinite(level)) return "never";
  if (level >= 3) return "lead";
  if (level >= 2) return "merge";
  if (level >= 1) return "propose";
  return "observe";
}

export interface SkillApprovalRow {
  id: string;
  entityType: string;
  entityId: string;
  status: ApprovalStatus;
  projectId: string | null;
  projectName: string | null;
  requestedByName: string | null;
  requesterNote: string | null;
  decidedByName: string | null;
  decisionNote: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

/**
 * Approvals where this skill was the requester. Matches by both the
 * canonical `agent:<slug>` requestedById form (Milestone D
 * skill_invocation) and the legacy `<slug> (bot)` requestedByName form.
 */
export async function getRecentApprovalsForSkill(
  organizationId: string,
  skillSlug: string,
  limit = 20,
): Promise<SkillApprovalRow[]> {
  const agentId = `agent:${skillSlug}`;
  const legacyName = `${skillSlug} (bot)%`;

  const rows = await db
    .select({
      id: approvals.id,
      entityType: approvals.entityType,
      entityId: approvals.entityId,
      status: approvals.status,
      projectId: approvals.projectId,
      projectName: projects.name,
      requestedByName: approvals.requestedByName,
      requesterNote: approvals.requesterNote,
      decidedByName: approvals.decidedByName,
      decisionNote: approvals.decisionNote,
      createdAt: approvals.createdAt,
      decidedAt: approvals.decidedAt,
    })
    .from(approvals)
    .leftJoin(projects, eq(projects.id, approvals.projectId))
    .where(
      and(
        eq(approvals.organizationId, organizationId),
        or(
          eq(approvals.requestedById, agentId),
          like(approvals.requestedByName, legacyName),
        ),
      ),
    )
    .orderBy(desc(approvals.createdAt))
    .limit(limit);

  return rows;
}

/**
 * Walk every (actionKind, changeRisk) pair and resolve the active
 * threshold. Results are sorted in a stable display order so the UI
 * doesn't churn between renders.
 */
export async function getProjectAutonomyPolicyMatrix(
  organizationId: string,
  projectId: string,
): Promise<PolicyMatrixCell[]> {
  const cells: PolicyMatrixCell[] = [];
  for (const actionKind of ACTION_KINDS) {
    for (const changeRisk of CHANGE_RISKS) {
      const resolved = await resolveAutonomyThreshold({
        organizationId,
        projectId,
        actionKind,
        changeRisk,
      });
      cells.push({
        actionKind,
        changeRisk,
        minLevel: resolved.minLevel,
        minLevelDisplay: levelDisplay(resolved.minLevel),
        source: resolved.source,
        enforcedByRuleId: resolved.enforcedByRuleId,
      });
    }
  }
  return cells;
}
