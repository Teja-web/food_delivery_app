"use server";

import { ruleCrud, listRulesForProject } from "@/operations/rules";
import type { RuleSeverity } from "@/db/schema/rule";

export async function listRules(opts: { offset?: number; limit?: number } = {}) {
  return ruleCrud.list({ offset: opts.offset ?? 0, limit: opts.limit ?? 25, sortBy: "createdAt", sortOrder: "desc" });
}

export async function getRule(id: string) {
  return ruleCrud.get(id);
}

export async function createRule(input: Parameters<typeof ruleCrud.create>[0]) {
  return ruleCrud.create(input);
}

export async function updateRule(id: string, input: Parameters<typeof ruleCrud.update>[1]) {
  return ruleCrud.update(id, input);
}

export async function deleteRule(id: string) {
  return ruleCrud.delete(id);
}

export interface CreateAutonomyThresholdRuleInput {
  title: string;
  /** null = org-wide */
  projectId: string | null;
  actionKind: "merge_pr" | "co_sign_promotion" | "deploy_production" | "*";
  changeRisk: "low" | "medium" | "high" | "critical" | "*";
  minAutonomy: "observe" | "propose" | "merge" | "lead";
  severity?: RuleSeverity;
  enabled?: boolean;
}

/**
 * Author an `autonomy-threshold` rule from the focused UI form. Constructs
 * the YAML-frontmatter body the rule-engine validator expects so customers
 * don't have to hand-author it.
 */
export async function createAutonomyThresholdRule(input: CreateAutonomyThresholdRuleInput) {
  const slug = `autonomy-${input.actionKind === "*" ? "any" : input.actionKind}-${input.changeRisk === "*" ? "any" : input.changeRisk}-${input.minAutonomy}-${Date.now().toString(36)}`;

  const body = [
    "---",
    "validator: autonomy-threshold",
    `actionKind: ${input.actionKind}`,
    `changeRisk: ${input.changeRisk}`,
    `minAutonomy: ${input.minAutonomy}`,
    "---",
    "",
    `# ${input.title}`,
    "",
    `When the execution gate sees a \`${input.actionKind}\` action at \`${input.changeRisk}\` change-risk on a skill operating below \`${input.minAutonomy}\`, the call is denied and routed to the approvals inbox. Override an autonomy demotion or compose with other rules by adding additional autonomy-threshold rules at narrower scopes (project-scoped rules win over org-scoped rules).`,
    "",
  ].join("\n");

  return ruleCrud.create({
    title: input.title,
    slug,
    body,
    severity: input.severity ?? "warn",
    enabled: input.enabled ?? true,
    projectId: input.projectId,
    tags: ["autonomy-threshold", "policy"],
  });
}

export { listRulesForProject };
