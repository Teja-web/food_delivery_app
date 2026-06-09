/**
 * Optional per-repo authoring config at `.agents/coznt.yaml`.
 *
 * Per docs/spec/dev-authoring-surface.md §10, a repo can override the default
 * discovery paths for plans / skills / rules and the PR-closed-unmerged
 * status. No config file is required — defaults work for greenfield repos.
 */

import { z } from "zod/v4";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { PLAN_KINDS } from "../../db/schema/plan/plan-kinds";

const PR_CLOSED_STATUSES = ["cancelled", "rejected"] as const;

export const cozntConfigSchema = z.object({
  plans: z
    .object({
      paths: z.record(z.enum(PLAN_KINDS), z.string()).optional(),
    })
    .optional(),
  skills: z.object({ path: z.string() }).optional(),
  rules: z.object({ path: z.string() }).optional(),
  status: z
    .object({
      prClosed: z.enum(PR_CLOSED_STATUSES).optional(),
    })
    .optional(),
});

export type CozntConfig = z.infer<typeof cozntConfigSchema>;

export interface ResolvedAuthoringPaths {
  skills: string;
  rules: string;
  plans: Record<(typeof PLAN_KINDS)[number], string[]>;
  /** Status assigned when a PR closes without merging. */
  prClosedStatus: (typeof PR_CLOSED_STATUSES)[number];
}

/** Built-in defaults per spec §7.1. */
export const DEFAULT_AUTHORING_PATHS: ResolvedAuthoringPaths = {
  skills: ".agents/skills/",
  rules: ".agents/rules/",
  plans: {
    spec: [".agents/plans/specs/", "docs/specs/"],
    adr: [".agents/plans/adrs/", "docs/adr/", "docs/adrs/", "docs/architecture-decisions/"],
    test_plan: [".agents/plans/test-plans/", "docs/test-plans/"],
    risk_register: [".agents/plans/risks/"],
    release_plan: [".agents/plans/releases/"],
    epic: [".agents/plans/epics/"],
    feature: [".agents/plans/features/"],
    story: [".agents/plans/stories/"],
    incident: [],
  },
  prClosedStatus: "cancelled",
};

export function parseCozntConfig(content: string): CozntConfig {
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err) {
    const detail = err instanceof YAMLParseError ? err.message : String(err);
    throw new Error(`invalid .agents/coznt.yaml: ${detail}`);
  }
  const result = cozntConfigSchema.safeParse(parsed ?? {});
  if (!result.success) {
    throw new Error(`invalid .agents/coznt.yaml: ${result.error.message}`);
  }
  return result.data;
}

export function resolveAuthoringPaths(config: CozntConfig | null): ResolvedAuthoringPaths {
  if (!config) return DEFAULT_AUTHORING_PATHS;
  const plans = { ...DEFAULT_AUTHORING_PATHS.plans };
  if (config.plans?.paths) {
    for (const kind of PLAN_KINDS) {
      const override = config.plans.paths[kind];
      if (override) plans[kind] = [normalizeDir(override), ...DEFAULT_AUTHORING_PATHS.plans[kind]];
    }
  }
  return {
    skills: normalizeDir(config.skills?.path ?? DEFAULT_AUTHORING_PATHS.skills),
    rules: normalizeDir(config.rules?.path ?? DEFAULT_AUTHORING_PATHS.rules),
    plans,
    prClosedStatus: config.status?.prClosed ?? DEFAULT_AUTHORING_PATHS.prClosedStatus,
  };
}

function normalizeDir(p: string): string {
  return p.endsWith("/") ? p : `${p}/`;
}
