import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { type Project, projects } from "@/db/schema/project";
import { RULE_SEVERITIES, type Rule, type RuleSeverity } from "@/db/schema/rule";
import { getActionContext } from "@/lib/auth/context";
import { ruleCrud } from "@/operations/rules";

import { RulesClient } from "./RulesClient";
import { serializeRuleRow, type RulesPageClient } from "./serialize";

export default async function RulesPage() {
  const ctx = await getActionContext();
  const { items, total } = await ruleCrud.list({ limit: 200, sortBy: "updatedAt", sortOrder: "desc" });
  const ruleItems = items as Rule[];

  // Load every project in the org so the autonomy-threshold dialog can scope
  // the rule. The original code only fetched projects that had at least one
  // existing rule — extend so we can target any project.
  const allProjectsInOrg = await db
    .select()
    .from(projects)
    .where(eq(projects.organizationId, ctx.organizationId));
  const projectsById = new Map<string, Project>(allProjectsInOrg.map((p) => [p.id, p]));

  const rows = ruleItems.map((r) => serializeRuleRow(r, projectsById));

  const bySeverity = RULE_SEVERITIES.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<RuleSeverity, number>,
  );
  let org = 0;
  let perProject = 0;
  let enabled = 0;
  for (const r of rows) {
    bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
    if (r.scope === "org") org += 1;
    else perProject += 1;
    if (r.enabled) enabled += 1;
  }

  const data: RulesPageClient = {
    rows,
    counts: { total, org, perProject, enabled, bySeverity },
    projects: allProjectsInOrg
      .map((p) => ({ id: p.id, name: p.name, slug: p.slug }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };

  return <RulesClient data={data} />;
}
