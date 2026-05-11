import { z } from "zod/v4";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { rules, RULE_SEVERITIES } from "@/db/schema/rule";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const ruleSchema = z.object({
  projectId: z.string().optional().nullable(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string()).optional(),
  phase: z.string().optional().nullable(),
  severity: z.enum(RULE_SEVERITIES).default("warn"),
  enabled: z.boolean().default(true),
});

export const ruleCrud = createEntityCrud({
  db,
  table: rules,
  queryKey: "rules",
  idField: "id",
  schema: ruleSchema,
  searchFields: ["title", "body"],
  onMutate: () => safeRevalidate("/rules"),
});

/** Rules visible to a project: project-scoped + org-wide. */
export async function listRulesForProject(projectId: string, phase?: string) {
  const ctx = await getActionContext();
  const scopeFilter = or(eq(rules.projectId, projectId), isNull(rules.projectId));
  const phaseFilter = phase ? or(eq(rules.phase, phase), isNull(rules.phase)) : undefined;

  return db.query.rules.findMany({
    where: and(eq(rules.organizationId, ctx.organizationId), eq(rules.enabled, true), scopeFilter, phaseFilter),
  });
}
