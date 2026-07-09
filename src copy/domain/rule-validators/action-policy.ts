/**
 * Action-policy validator — declarative guardrails for what an autonomous
 * actor (skill / task / deployment) is allowed to do.
 *
 * Borrowed from `ai-sdlc-framework/ai-sdlc`'s `agent-role.yaml`. See
 * `docs/borrowings-from-ai-sdlc-framework.md` section 2.
 *
 * Frontmatter shape (parsed by rule-engine.ts):
 *
 *   ---
 *   validator: action-policy
 *   appliesTo: skill              # "skill" | "task" | "deployment"
 *   blockedActions: ["*--force*", "rm -rf*"]    # glob patterns matched against `command`
 *   blockedPaths: [".github/**", ".ai-sdlc/**"] # glob patterns matched against `paths[]`
 *   requireTests: true
 *   maxFilesPerChange: 15
 *   maxLoc: 150                   # max additions+deletions in a PR
 *   minCoverage: 85               # min test coverage % (0..100)
 *   ---
 *
 * The caller passes a `ProposedAction` describing what it knows about the
 * pending action. Each field is optional — the validator only checks fields
 * that are present in both the policy and the action.
 *
 * For `maxLoc` / `minCoverage` the caller is responsible for populating
 * `loc` and `coverage` on the `ProposedAction` from PR metadata (e.g. the
 * GitHub PR diff stats + the CI coverage report). When the caller omits
 * those fields the validator stays silent rather than rejecting — a missing
 * coverage signal must not flip a previously-passing gate.
 */

import type { RuleSeverity } from "@/db/schema/rule";

export type ActionPolicyAppliesTo = "skill" | "task" | "deployment";

export interface ActionPolicyConfig {
  validator: "action-policy";
  appliesTo?: ActionPolicyAppliesTo;
  blockedActions?: string[];
  blockedPaths?: string[];
  requireTests?: boolean;
  maxFilesPerChange?: number;
  /** Max additions+deletions across the PR. Pairs with `ProposedAction.loc`. */
  maxLoc?: number;
  /** Min test coverage percentage (0..100). Pairs with `ProposedAction.coverage`. */
  minCoverage?: number;
}

export interface ProposedAction {
  /** Short identifier (e.g. shell command, skill slug, task name). */
  command?: string;
  /** File paths the action will read or write. */
  paths?: string[];
  /** Total file count for the change. Used by `maxFilesPerChange`. */
  fileCount?: number;
  /** Does this change include or reference tests? */
  hasTests?: boolean;
  /** Total lines changed (additions+deletions). Used by `maxLoc`. */
  loc?: number;
  /** Test coverage percentage (0..100). Used by `minCoverage`. */
  coverage?: number;
}

export interface RuleViolation {
  ruleId: string;
  ruleTitle: string;
  severity: RuleSeverity;
  message: string;
}

interface PolicyRuleMeta {
  id: string;
  title: string;
  severity: RuleSeverity;
}

/**
 * Convert a glob pattern to an anchored RegExp.
 *
 * Rules:
 *   - `**` matches any run of characters (including `/`).
 *   - `*`  matches any run of characters EXCEPT `/`.
 *   - `?`  matches a single non-`/` character.
 *   - All other regex metacharacters are escaped.
 *   - The pattern is fully anchored (^...$) so a bare `rm -rf` would NOT
 *     match `git rm -rf` — callers should use `*rm -rf*` if they want a
 *     substring match. Mirrors how `.gitignore` / minimatch work.
 */
function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?") {
      out += "[^/]";
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  return new RegExp(`^${out}$`);
}

function matchesAnyGlob(value: string, patterns: string[] | undefined): string | null {
  if (!patterns || patterns.length === 0) return null;
  for (const pattern of patterns) {
    if (globToRegExp(pattern).test(value)) return pattern;
  }
  return null;
}

/**
 * Evaluate a parsed action-policy rule against a proposed action.
 * Returns `null` if no violation, or a single `RuleViolation` summarising
 * the first failing constraint. We collapse multiple failures into one
 * violation so the audit-log row maps 1:1 with the rule.
 */
export function evaluateActionPolicy(
  rule: PolicyRuleMeta,
  config: ActionPolicyConfig,
  action: ProposedAction,
): RuleViolation | null {
  const reasons: string[] = [];

  // 1. Blocked actions — only check if a command was supplied.
  if (action.command !== undefined && config.blockedActions?.length) {
    const hit = matchesAnyGlob(action.command, config.blockedActions);
    if (hit) reasons.push(`command "${action.command}" blocked by pattern "${hit}"`);
  }

  // 2. Blocked paths — check each provided path.
  if (action.paths && action.paths.length > 0 && config.blockedPaths?.length) {
    const offending: string[] = [];
    for (const p of action.paths) {
      const hit = matchesAnyGlob(p, config.blockedPaths);
      if (hit) offending.push(`${p} (matches ${hit})`);
    }
    if (offending.length) reasons.push(`blocked paths: ${offending.join(", ")}`);
  }

  // 3. requireTests — only checks if the caller said anything about tests.
  if (config.requireTests === true && action.hasTests === false) {
    reasons.push("requires tests but none were declared");
  }

  // 4. maxFilesPerChange — only checks if fileCount is supplied.
  if (
    typeof config.maxFilesPerChange === "number" &&
    typeof action.fileCount === "number" &&
    action.fileCount > config.maxFilesPerChange
  ) {
    reasons.push(`fileCount ${action.fileCount} exceeds max ${config.maxFilesPerChange}`);
  }

  // 5. maxLoc — only checks if loc is supplied.
  if (
    typeof config.maxLoc === "number" &&
    typeof action.loc === "number" &&
    action.loc > config.maxLoc
  ) {
    reasons.push(`loc ${action.loc} exceeds max ${config.maxLoc}`);
  }

  // 6. minCoverage — only checks if coverage is supplied.
  if (
    typeof config.minCoverage === "number" &&
    typeof action.coverage === "number" &&
    action.coverage < config.minCoverage
  ) {
    reasons.push(`coverage ${action.coverage}% below required ${config.minCoverage}%`);
  }

  if (reasons.length === 0) return null;

  return {
    ruleId: rule.id,
    ruleTitle: rule.title,
    severity: rule.severity,
    message: `${rule.title} — ${reasons.join("; ")}`,
  };
}

// Exported for tests that want to assert glob behaviour directly.
export const __test = { globToRegExp, matchesAnyGlob };
