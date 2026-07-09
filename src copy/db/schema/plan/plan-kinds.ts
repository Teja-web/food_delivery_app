/**
 * Project Task enums — leaf file with no Drizzle imports.
 *
 * Lives next to the schema so the MCP CLI bundle can import these
 * constants without dragging in `drizzle-orm/pg-core` and the rest of
 * the schema chain. The full Drizzle table definition in `project-task.ts`
 * re-exports from here.
 */

export const PLAN_KINDS = [
  "epic",
  "feature",
  "story",
  "spec",
  "adr",
  "test_plan",
  "release_plan",
  "risk_register",
  "incident",
] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

/**
 * UX hint for which parent kinds the create-flow should suggest. Not
 * schema-enforced — relationships live in `plan_relationships` (kind=`parent_of`).
 */
export const PLAN_KIND_PARENTS: Partial<Record<PlanKind, PlanKind[]>> = {
  feature: ["epic"],
  story: ["feature", "epic"],
  spec: ["feature", "story", "epic"],
  adr: ["epic", "feature", "spec"],
  test_plan: ["feature", "story", "spec"],
  release_plan: ["epic", "feature"],
  risk_register: ["epic", "feature", "release_plan"],
  // incident is root; no parent
};

export const PLAN_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "in_progress",
  "completed",
  "rejected",
  "changes_requested",
  "cancelled",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_PRIORITIES = ["p0", "p1", "p2", "p3"] as const;
export type PlanPriority = (typeof PLAN_PRIORITIES)[number];

export const PLAN_CLASSIFICATIONS = ["enabler", "spike", "bug", "debt"] as const;
export type PlanClassification = (typeof PLAN_CLASSIFICATIONS)[number];

export const PLAN_RELATIONSHIP_KINDS = [
  "parent_of",
  "supersedes",
  "derived_from",
  "blocks",
  "relates_to",
  "causes",
  "references",
] as const;
export type PlanRelationshipKind = (typeof PLAN_RELATIONSHIP_KINDS)[number];
