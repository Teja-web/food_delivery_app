/**
 * Plan ↔ markdown serialization.
 *
 * Output shape (OpenSpec-flavored):
 *
 *   ---
 *   id: plan_abc123
 *   kind: feature
 *   status: in_review
 *   project: project-slug
 *   parent: plan_xyz789
 *   priority: p1
 *   externalRef: https://github.com/org/repo/issues/42
 *   updatedAt: 2026-05-11T12:34:56Z
 *   ---
 *
 *   # Title
 *
 *   > Summary line.
 *
 *   <body>
 *
 * Files land at `.dilliznt/plans/<kind>/<slug-or-id>.md` in the consumer
 * repo. The platform never writes to the consumer's git directly — it
 * exposes the file content over HTTP and a manifest of all files for a
 * project, and a CI job in the consumer's repo mirrors them.
 */

import type { Plan } from "@/db/schema/plan";
import type { Project } from "@/db/schema/project";

function yamlEscape(value: string): string {
  if (/[:#&*!|>'"%@`{}\[\],\n]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function appendField(lines: string[], key: string, value: unknown): void {
  if (value == null || value === "") return;
  if (value instanceof Date) {
    lines.push(`${key}: ${value.toISOString()}`);
    return;
  }
  lines.push(`${key}: ${yamlEscape(String(value))}`);
}

export interface PlanMarkdownContext {
  project?: Pick<Project, "slug">;
}

export function serializePlanToMarkdown(plan: Plan, ctx: PlanMarkdownContext = {}): string {
  const frontmatter: string[] = ["---"];
  appendField(frontmatter, "id", plan.id);
  appendField(frontmatter, "kind", plan.kind);
  appendField(frontmatter, "status", plan.status);
  appendField(frontmatter, "project", ctx.project?.slug ?? plan.projectId);
  appendField(frontmatter, "parent", plan.parentPlanId);
  appendField(frontmatter, "priority", plan.priority);
  appendField(frontmatter, "effortEstimate", plan.effortEstimate);
  appendField(frontmatter, "externalRef", plan.externalRef);
  appendField(frontmatter, "assignee", plan.assigneeName ?? plan.assigneeId);
  appendField(frontmatter, "updatedAt", plan.updatedAt);
  frontmatter.push("---");
  frontmatter.push("");

  const head: string[] = [`# ${plan.title}`, ""];
  if (plan.summary) head.push(`> ${plan.summary}`, "");

  const body = plan.body ? plan.body : "_No body yet._";

  return [...frontmatter, ...head, body, ""].join("\n");
}

/** Relative path the file should land at inside the consumer's repo. */
export function planFilePath(plan: Pick<Plan, "id" | "kind" | "slug">): string {
  const base = plan.slug && plan.slug.length > 0 ? plan.slug : plan.id;
  return `.dilliznt/plans/${plan.kind}/${base}.md`;
}
