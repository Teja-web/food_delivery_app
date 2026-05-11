/**
 * Rule engine — evaluate plans against active rules.
 *
 * A rule's markdown body may carry a YAML frontmatter block:
 *
 *   ---
 *   validator: keyword-presence
 *   requires: ["acceptance criteria", "rollback"]
 *   forbids:  ["TODO", "TBD"]
 *   ---
 *
 *   ## Why this rule exists
 *   ...
 *
 * Today only `keyword-presence` is implemented. Other validators (e.g.
 * `regex`, `ai-eval`, `schema`) plug in via the same dispatch.
 *
 * Severity behavior:
 *   error → throw RuleViolationError so the plan write is rolled back
 *   warn  → returned as warnings; caller logs an audit_logs entry
 *   info  → returned as warnings (no audit emission)
 */

import { and, eq, isNull, or, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { rules, type Rule, type RuleSeverity } from "@/db/schema/rule";
import { auditLogs } from "@/db/schema/audit-log";
import { getActionContext } from "@/lib/auth/context";
import type { Plan } from "@/db/schema/plan";

export interface RuleViolation {
  ruleId: string;
  ruleTitle: string;
  severity: RuleSeverity;
  message: string;
}

export class RuleViolationError extends Error {
  status = 422;
  constructor(public readonly violations: RuleViolation[]) {
    super(`${violations.length} rule violation(s): ${violations.map((v) => v.ruleTitle).join(", ")}`);
    this.name = "RuleViolationError";
  }
}

interface ParsedRuleConfig {
  validator?: string;
  requires?: string[];
  forbids?: string[];
}

/** Very small YAML frontmatter parser; tolerates only the keys we know. */
function parseRuleFrontmatter(body: string): { config: ParsedRuleConfig; markdown: string } {
  const match = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { config: {}, markdown: body };

  const config: ParsedRuleConfig = {};
  const lines = match[1].split("\n");
  for (const line of lines) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2].trim();
    if (key === "validator") config.validator = value;
    if ((key === "requires" || key === "forbids") && value.startsWith("[") && value.endsWith("]")) {
      try {
        config[key] = JSON.parse(value.replace(/'/g, '"')) as string[];
      } catch {
        // ignore malformed list; treat as no constraint
      }
    }
  }
  return { config, markdown: match[2] };
}

interface KeywordEvalResult {
  ok: boolean;
  missing: string[];
  forbidden: string[];
}

function evaluateKeywordPresence(plan: Pick<Plan, "title" | "summary" | "body">, cfg: ParsedRuleConfig): KeywordEvalResult {
  const haystack = `${plan.title}\n${plan.summary ?? ""}\n${plan.body}`.toLowerCase();
  const missing = (cfg.requires ?? []).filter((kw) => !haystack.includes(kw.toLowerCase()));
  const forbidden = (cfg.forbids ?? []).filter((kw) => haystack.includes(kw.toLowerCase()));
  return { ok: missing.length === 0 && forbidden.length === 0, missing, forbidden };
}

function violationMessage(rule: Pick<Rule, "title">, eval_: KeywordEvalResult): string {
  const parts: string[] = [];
  if (eval_.missing.length) parts.push(`missing required: ${eval_.missing.join(", ")}`);
  if (eval_.forbidden.length) parts.push(`contains forbidden: ${eval_.forbidden.join(", ")}`);
  return `${rule.title} — ${parts.join("; ")}`;
}

export async function evaluatePlanAgainstRules(plan: Plan): Promise<RuleViolation[]> {
  const ctx = await getActionContext();

  const matched: Rule[] = await db.query.rules.findMany({
    where: and(
      eq(rules.organizationId, ctx.organizationId),
      eq(rules.enabled, true),
      or(isNull(rules.projectId), eq(rules.projectId, plan.projectId)),
      or(isNull(rules.phase), inArray(rules.phase, [plan.kind, "all"])),
    ),
  });

  const violations: RuleViolation[] = [];
  for (const rule of matched) {
    const { config } = parseRuleFrontmatter(rule.body);
    if (config.validator && config.validator !== "keyword-presence") {
      // Unknown validator; skip silently. Future: dispatch to other validators.
      continue;
    }
    const result = evaluateKeywordPresence(plan, config);
    if (result.ok) continue;
    violations.push({
      ruleId: rule.id,
      ruleTitle: rule.title,
      severity: rule.severity,
      message: violationMessage(rule, result),
    });
  }

  return violations;
}

/**
 * Apply rules to a plan on write. Errors throw; warns get audit-logged.
 * Caller invokes this from planCrud's afterCreate/afterUpdate hooks.
 */
export async function applyRulesToPlan(plan: Plan): Promise<RuleViolation[]> {
  const violations = await evaluatePlanAgainstRules(plan);
  const errors = violations.filter((v) => v.severity === "error");
  const warns = violations.filter((v) => v.severity !== "error");

  if (warns.length > 0) {
    const ctx = await getActionContext();
    await db.insert(auditLogs).values(
      warns.map((w) => ({
        organizationId: ctx.organizationId,
        actorType: "system" as const,
        actorId: w.ruleId,
        actorName: w.ruleTitle,
        action: "rule.warned",
        entityType: "plan",
        entityId: plan.id,
        summary: w.message,
        after: { ruleSeverity: w.severity },
      })),
    );
  }

  if (errors.length > 0) {
    throw new RuleViolationError(errors);
  }

  return violations;
}
