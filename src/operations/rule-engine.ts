/**
 * Rule engine — evaluate plans and proposed actions against active rules.
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
 * Validators implemented today:
 *   - `keyword-presence` — checks plan text for required/forbidden tokens.
 *   - `action-policy`   — guards what skills/tasks/deployments may do.
 *                         See `src/lib/rule-validators/action-policy.ts` and
 *                         `docs/borrowings-from-ai-sdlc-framework.md` section 2.
 *
 * Other validators (e.g. `regex`, `ai-eval`, `schema`) plug in via the same
 * dispatch.
 *
 * Severity behavior:
 *   error → throw RuleViolationError so the plan write is rolled back
 *   warn  → returned as warnings; caller logs an audit_logs entry
 *   info  → returned as warnings (no audit emission)
 */

import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { rules, type Rule, type RuleSeverity } from "@/db/schema/rule";
import { auditLogs } from "@/db/schema/audit/audit-log";
import { getActionContext } from "@/lib/auth/context";
import type { PlanArtifact as Plan } from "@/db/schema/plan/plan-artifact";
import {
  evaluateActionPolicy,
  type ActionPolicyAppliesTo,
  type ActionPolicyConfig,
  type ProposedAction,
} from "@/domain/rule-validators/action-policy";

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
  // keyword-presence
  requires?: string[];
  forbids?: string[];
  // action-policy
  appliesTo?: ActionPolicyAppliesTo;
  blockedActions?: string[];
  blockedPaths?: string[];
  requireTests?: boolean;
  maxFilesPerChange?: number;
  maxLoc?: number;
  minCoverage?: number;
}

function parseJsonStringArray(value: string): string[] | undefined {
  if (!(value.startsWith("[") && value.endsWith("]"))) return undefined;
  try {
    const parsed = JSON.parse(value.replace(/'/g, '"'));
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed as string[];
    }
  } catch {
    // ignore malformed list; treat as no constraint
  }
  return undefined;
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

    if (key === "validator") {
      config.validator = value;
    } else if (key === "appliesTo") {
      if (value === "skill" || value === "task" || value === "deployment") {
        config.appliesTo = value;
      }
    } else if (key === "requireTests") {
      config.requireTests = value === "true";
    } else if (key === "maxFilesPerChange") {
      const n = Number(value);
      if (Number.isFinite(n)) config.maxFilesPerChange = n;
    } else if (key === "maxLoc") {
      const n = Number(value);
      if (Number.isFinite(n)) config.maxLoc = n;
    } else if (key === "minCoverage") {
      const n = Number(value);
      if (Number.isFinite(n)) config.minCoverage = n;
    } else if (key === "requires" || key === "forbids") {
      const arr = parseJsonStringArray(value);
      if (arr) config[key] = arr;
    } else if (key === "blockedActions" || key === "blockedPaths") {
      const arr = parseJsonStringArray(value);
      if (arr) config[key] = arr;
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
    ),
  });

  const violations: RuleViolation[] = [];
  for (const rule of matched) {
    const { config } = parseRuleFrontmatter(rule.body);
    // Only the keyword-presence validator applies to plan writes. Other
    // validators (e.g. action-policy) have their own evaluation entry points
    // (see `applyActionPolicyRules`).
    if (config.validator && config.validator !== "keyword-presence") continue;
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
        invokedVia: "rule-engine:plan-write",
        after: { ruleSeverity: w.severity },
      })),
    );
  }

  if (errors.length > 0) {
    throw new RuleViolationError(errors);
  }

  return violations;
}

/**
 * Evaluate action-policy rules against a proposed action. Mirrors the
 * `applyRulesToPlan` shape: error-severity violations throw, warn/info get
 * audit-logged.
 *
 * `appliesTo` filters which rules participate — e.g. only `skill`-scoped
 * action-policy rules will be evaluated when called from skill invocation.
 *
 * Scope is supplied explicitly so worker tasks (which already carry a
 * ScopedActionContext) can pass the org/project IDs they have on hand
 * rather than re-reading getActionContext() — important when this is
 * called from places that may not have a logged-in user context.
 */
export async function applyActionPolicyRules(
  appliesTo: ActionPolicyAppliesTo,
  proposedAction: ProposedAction,
  scope: { organizationId: string; projectId?: string | null },
): Promise<RuleViolation[]> {
  const projectClause = scope.projectId
    ? or(isNull(rules.projectId), eq(rules.projectId, scope.projectId))
    : isNull(rules.projectId);

  const matched: Rule[] = await db.query.rules.findMany({
    where: and(
      eq(rules.organizationId, scope.organizationId),
      eq(rules.enabled, true),
      projectClause,
    ),
  });

  const violations: RuleViolation[] = [];
  for (const rule of matched) {
    const { config } = parseRuleFrontmatter(rule.body);
    if (config.validator !== "action-policy") continue;
    // `appliesTo` undefined means "any" — be conservative and skip; policy
    // authors should be explicit about which surface they target.
    if (config.appliesTo !== undefined && config.appliesTo !== appliesTo) continue;

    const policyConfig: ActionPolicyConfig = {
      validator: "action-policy",
      appliesTo: config.appliesTo,
      blockedActions: config.blockedActions,
      blockedPaths: config.blockedPaths,
      requireTests: config.requireTests,
      maxFilesPerChange: config.maxFilesPerChange,
      maxLoc: config.maxLoc,
      minCoverage: config.minCoverage,
    };

    const v = evaluateActionPolicy(
      { id: rule.id, title: rule.title, severity: rule.severity },
      policyConfig,
      proposedAction,
    );
    if (v) violations.push(v);
  }

  const errors = violations.filter((v) => v.severity === "error");
  const warns = violations.filter((v) => v.severity !== "error");

  if (warns.length > 0) {
    await db.insert(auditLogs).values(
      warns.map((w) => ({
        organizationId: scope.organizationId,
        actorType: "system" as const,
        actorId: w.ruleId,
        actorName: w.ruleTitle,
        action: "rule.warned",
        entityType: appliesTo,
        entityId: proposedAction.command ?? "(unknown)",
        summary: w.message,
        invokedVia: `rule-engine:${appliesTo}`,
        after: { ruleSeverity: w.severity, appliesTo },
      })),
    );
  }

  if (errors.length > 0) {
    throw new RuleViolationError(errors);
  }

  return violations;
}

// Re-export for callers that wire up enforcement.
export type { ProposedAction, ActionPolicyAppliesTo } from "@/domain/rule-validators/action-policy";
