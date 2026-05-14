/**
 * Plan enums — leaf file with no Drizzle imports.
 *
 * Lives next to the schema so the MCP CLI bundle can import these
 * constants without dragging in `drizzle-orm/pg-core` and the rest of
 * the schema chain. The full Drizzle table definition in `plan.ts`
 * re-exports from here so app-side callers keep their `@/db/schema/plan`
 * imports.
 */

export const PLAN_KINDS = [
  "epic",
  "feature",
  "story",
  "adr",
  "test_plan",
  "release_plan",
  "incident",
  "storyboard",
  "dev_summary",
  "go_live_report",
  "cicd_pipeline",
] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

/** Canonical parent → child rollup for hierarchy validation. */
export const PLAN_KIND_PARENTS: Partial<Record<PlanKind, PlanKind[]>> = {
  feature: ["epic"],
  story: ["feature", "epic"],
  adr: ["epic", "feature"],
  test_plan: ["feature", "story"],
  release_plan: ["epic", "feature"],
  storyboard: ["feature", "epic"],
  dev_summary: ["feature", "story"],
  go_live_report: ["release_plan"],
  cicd_pipeline: ["release_plan", "epic"],
};

export const PLAN_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "in_progress",
  "completed",
  "rejected",
  "cancelled",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_PRIORITIES = ["p0", "p1", "p2", "p3"] as const;
export type PlanPriority = (typeof PLAN_PRIORITIES)[number];
