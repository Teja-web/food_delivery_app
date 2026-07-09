import type { Rule, RuleSeverity } from "@/db/schema/rule";
import type { Project } from "@/db/schema/project";

export type RuleRowClient = {
  id: string;
  slug: string;
  title: string;
  body: string | null;
  severity: RuleSeverity;
  tags: string[];
  enabled: boolean;
  scope: "org" | "project";
  projectId: string | null;
  projectName: string | null;
  projectSlug: string | null;
  updatedAtIso: string;
};

export type RulesPageClient = {
  rows: RuleRowClient[];
  counts: {
    total: number;
    org: number;
    perProject: number;
    enabled: number;
    bySeverity: Record<RuleSeverity, number>;
  };
  /** All projects in the org — for the autonomy-threshold dialog's scope picker. */
  projects: { id: string; name: string; slug: string }[];
};

export function serializeRuleRow(
  rule: Rule,
  projectsById: Map<string, Project>,
): RuleRowClient {
  const proj = rule.projectId ? projectsById.get(rule.projectId) ?? null : null;
  return {
    id: rule.id,
    slug: rule.slug,
    title: rule.title,
    body: rule.body ?? null,
    severity: rule.severity,
    tags: rule.tags ?? [],
    enabled: rule.enabled,
    scope: rule.projectId ? "project" : "org",
    projectId: rule.projectId ?? null,
    projectName: proj?.name ?? (rule.projectId ? rule.projectId.slice(0, 6) : null),
    projectSlug: proj?.slug ?? null,
    updatedAtIso: rule.updatedAt.toISOString(),
  };
}
