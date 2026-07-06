/**
 * Governance Policies — CRUD on rule definitions.
 *
 * Kind discriminator: gate | approval | review | exception.
 * Scope discriminator: organization | project | repository | environment | project_task.
 * Per-kind config validated by Zod in `lib/governance/schemas.ts`.
 */

import { z } from "zod/v4";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import {
  governancePolicies,
  GOVERNANCE_KINDS,
  GOVERNANCE_SCOPES,
} from "@/db/schema/governance/policies";
import { PLAN_KINDS, PLAN_STATUSES } from "@/db/schema/plan/plan-kinds";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const policySchema = z.object({
  kind: z.enum(GOVERNANCE_KINDS),
  scopeType: z.enum(GOVERNANCE_SCOPES),
  scopeId: z.string().nullable().optional(),
  appliesToPlanKind: z.enum(PLAN_KINDS).nullable().optional(),
  transitionFrom: z.enum(PLAN_STATUSES).nullable().optional(),
  transitionTo: z.enum(PLAN_STATUSES).nullable().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const governancePolicyCrud = createEntityCrud({
  db,
  table: governancePolicies,
  queryKey: "governancePolicies",
  idField: "id",
  schema: policySchema,
  searchFields: ["name", "description"],
  onMutate: () => safeRevalidate("/governance/policies"),
});

/**
 * Policies applicable to a given (planKind, transitionFrom→transitionTo) on a project.
 * Returns project-scoped + org-scoped policies that match the transition.
 */
export async function listPoliciesForTransition(args: {
  projectId: string;
  planKind: string;
  transitionFrom: string;
  transitionTo: string;
}) {
  const ctx = await getActionContext();
  const rows = await db.query.governancePolicies.findMany({
    where: and(
      eq(governancePolicies.organizationId, ctx.organizationId),
      eq(governancePolicies.enabled, true),
      or(
        and(
          eq(governancePolicies.scopeType, "project"),
          eq(governancePolicies.scopeId, args.projectId),
        ),
        and(eq(governancePolicies.scopeType, "organization"), isNull(governancePolicies.scopeId)),
      ),
    ),
  });
  return rows.filter((p) => {
    if (p.appliesToPlanKind && p.appliesToPlanKind !== args.planKind) return false;
    if (p.transitionFrom && p.transitionFrom !== args.transitionFrom) return false;
    if (p.transitionTo && p.transitionTo !== args.transitionTo) return false;
    return true;
  });
}

export async function listPoliciesForProject(projectId: string) {
  const ctx = await getActionContext();
  return db.query.governancePolicies.findMany({
    where: and(
      eq(governancePolicies.organizationId, ctx.organizationId),
      or(
        and(
          eq(governancePolicies.scopeType, "project"),
          eq(governancePolicies.scopeId, projectId),
        ),
        and(eq(governancePolicies.scopeType, "organization"), isNull(governancePolicies.scopeId)),
      ),
    ),
  });
}
