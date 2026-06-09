/**
 * Keyword-presence validator — checks plan-artifact body text for
 * required / forbidden tokens.
 *
 * Promoted from `src/operations/rule-engine.ts` per
 * docs/spec/dev-authoring-surface.md §10 design rule D4 (one evaluator
 * dispatcher; per-validator logic lives in
 * `src/domain/rule-validators/<name>.ts`).
 *
 * Frontmatter shape:
 *
 *   ---
 *   validator: keyword-presence
 *   appliesTo:
 *     planKinds: [spec, adr]
 *     onTransition:
 *       - from: in_review
 *         to: approved
 *   config:
 *     requires: ["Rollback", "Acceptance criteria"]
 *     forbids: ["TBD", "TODO"]
 *     caseSensitive: false
 *   ---
 *
 * The caller assembles the haystack from the plan's title + summary + body
 * and passes it in. The validator is pure: no DB access, no side effects.
 */

import type { RuleSeverity } from "@/db/schema/rule";

export interface KeywordPresenceConfig {
  validator: "keyword-presence";
  requires?: string[];
  forbids?: string[];
  caseSensitive?: boolean;
}

export interface KeywordPresenceAppliesTo {
  planKinds?: string[];
  onTransition?: Array<{ from: string; to: string }>;
}

export interface KeywordPresenceInput {
  /** Concatenated text to search; typically `${title}\n${summary}\n${body}`. */
  haystack: string;
}

export interface KeywordPresenceResult {
  ok: boolean;
  missing: string[];
  forbidden: string[];
}

export function evaluateKeywordPresence(
  input: KeywordPresenceInput,
  config: KeywordPresenceConfig,
): KeywordPresenceResult {
  const cs = config.caseSensitive === true;
  const haystack = cs ? input.haystack : input.haystack.toLowerCase();
  const norm = (s: string) => (cs ? s : s.toLowerCase());
  const missing = (config.requires ?? []).filter((kw) => !haystack.includes(norm(kw)));
  const forbidden = (config.forbids ?? []).filter((kw) => haystack.includes(norm(kw)));
  return { ok: missing.length === 0 && forbidden.length === 0, missing, forbidden };
}

export function keywordPresenceMessage(
  ruleTitle: string,
  result: KeywordPresenceResult,
): string {
  const parts: string[] = [];
  if (result.missing.length) parts.push(`missing required: ${result.missing.join(", ")}`);
  if (result.forbidden.length) parts.push(`contains forbidden: ${result.forbidden.join(", ")}`);
  return `${ruleTitle} — ${parts.join("; ")}`;
}

/** Severity-aware predicate: a `warn`/`info` rule never blocks the transition. */
export function keywordPresenceBlocks(
  severity: RuleSeverity,
  result: KeywordPresenceResult,
): boolean {
  return severity === "error" && !result.ok;
}
