/**
 * Evidence enums — leaf file with no Drizzle imports.
 *
 * Lives next to the schema so the MCP CLI bundle can import these
 * constants without dragging in `drizzle-orm/pg-core` and the rest of
 * the schema chain. The full Drizzle table definition in `evidence.ts`
 * re-exports from here.
 */

export const EVIDENCE_TYPES = [
  "deployment",
  "test_run",
  "metric_snapshot",
  "work_item",
  "skill_outcome",
  "incident",
  "external_link",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const EVIDENCE_ROLES = [
  "implements",
  "validates",
  "deploys",
  "observes",
  "causes",
] as const;
export type EvidenceRole = (typeof EVIDENCE_ROLES)[number];
