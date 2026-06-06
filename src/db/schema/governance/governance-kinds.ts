/**
 * Governance enums — leaf file with no Drizzle imports.
 *
 * Lives next to the schema so the MCP CLI bundle can import these
 * constants without dragging in `drizzle-orm/pg-core` and the rest of
 * the schema chain. The full Drizzle definitions in `policies.ts` and
 * `records.ts` re-export from here.
 */

export const GOVERNANCE_KINDS = ["gate", "approval", "review", "exception"] as const;
export type GovernanceKind = (typeof GOVERNANCE_KINDS)[number];

export const GOVERNANCE_SCOPES = [
  "organization",
  "project",
  "repository",
  "environment",
  "plan_artifact",
] as const;
export type GovernanceScope = (typeof GOVERNANCE_SCOPES)[number];

export const GATE_TYPES = ["approval", "coverage", "lint", "security", "custom"] as const;
export type GateType = (typeof GATE_TYPES)[number];

export const GOVERNANCE_RECORD_STATUSES = [
  "pending",
  "passed",
  "failed",
  "skipped",
  "expired",
] as const;
export type GovernanceRecordStatus = (typeof GOVERNANCE_RECORD_STATUSES)[number];
