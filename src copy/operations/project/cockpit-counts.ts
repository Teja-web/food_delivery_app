/**
 * Single-roundtrip aggregate of the counts shown in the project cockpit
 * tab strip. One Promise.all of cheap COUNT(*) queries keeps the layout
 * server fetch O(1) instead of O(tabs).
 */

import { and, eq, gte, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { deployments } from "@/db/schema/deployment";
import { projectTasks as plans } from "@/db/schema/plan/project-task";
import { rules } from "@/db/schema/rule";
import { skills } from "@/db/schema/skill/skill";
import { skillOutcomes } from "@/db/schema/skill/skill-outcome";
import { workItems } from "@/db/schema/work-item";
import { getActionContext } from "@/lib/auth/context";

export interface CockpitTabCounts {
  plansTotal: number;
  requirements: number;
  tests: number;
  adrs: number;
  workItems: number;
  rulesAndSkills: number;
  deployments: number;
  trustOutcomes: number;
}

const REQUIREMENT_KINDS = ["epic", "feature", "story", "requirement"];
const TEST_KINDS = ["test_plan"];
const ADR_KINDS = ["adr"];
const TRUST_WINDOW_DAYS = 30;

export async function getProjectCockpitCounts(
  projectId: string,
): Promise<CockpitTabCounts> {
  const ctx = await getActionContext();
  const orgId = ctx.organizationId;
  const trustSince = new Date(Date.now() - TRUST_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const countExpr = sql<number>`count(*)::int`;

  const [
    plansByKind,
    [workItemsRow],
    [rulesRow],
    [skillsRow],
    [deploymentsRow],
    [trustRow],
  ] = await Promise.all([
    db
      .select({ kind: plans.kind, n: countExpr })
      .from(plans)
      .where(and(eq(plans.organizationId, orgId), eq(plans.projectId, projectId)))
      .groupBy(plans.kind),
    db
      .select({ n: countExpr })
      .from(workItems)
      .where(and(eq(workItems.organizationId, orgId), eq(workItems.projectId, projectId))),
    db
      .select({ n: countExpr })
      .from(rules)
      .where(
        and(
          eq(rules.organizationId, orgId),
          eq(rules.enabled, true),
          or(eq(rules.projectId, projectId), isNull(rules.projectId)),
        ),
      ),
    db
      .select({ n: countExpr })
      .from(skills)
      .where(
        and(
          eq(skills.organizationId, orgId),
          eq(skills.enabled, true),
          or(eq(skills.projectId, projectId), isNull(skills.projectId)),
        ),
      ),
    db
      .select({ n: countExpr })
      .from(deployments)
      .where(and(eq(deployments.organizationId, orgId), eq(deployments.projectId, projectId))),
    db
      .select({ n: countExpr })
      .from(skillOutcomes)
      .where(
        and(
          eq(skillOutcomes.organizationId, orgId),
          eq(skillOutcomes.projectId, projectId),
          gte(skillOutcomes.recordedAt, trustSince),
        ),
      ),
  ]);

  let plansTotal = 0;
  let requirements = 0;
  let tests = 0;
  let adrs = 0;
  for (const row of plansByKind) {
    plansTotal += row.n;
    if (REQUIREMENT_KINDS.includes(row.kind)) requirements += row.n;
    if (TEST_KINDS.includes(row.kind)) tests += row.n;
    if (ADR_KINDS.includes(row.kind)) adrs += row.n;
  }

  return {
    plansTotal,
    requirements,
    tests,
    adrs,
    workItems: workItemsRow?.n ?? 0,
    rulesAndSkills: (rulesRow?.n ?? 0) + (skillsRow?.n ?? 0),
    deployments: deploymentsRow?.n ?? 0,
    trustOutcomes: trustRow?.n ?? 0,
  };
}
