/**
 * Audit operation — composes the unified audit-log view.
 *
 * Reads from `audit_logs` (domain-level state changes) and `skill_outcomes`
 * (every skill verdict) and normalizes both into a single chronological feed
 * for the /audit page (Audit log in the sidebar). Designed for the H7 "CISO 24-hour
 * drill" parameterized query → export workflow.
 *
 * When neither table has rows for the org yet, we synthesize a short fixture
 * so the UI is never empty during early dev (gated by the row counts).
 */

import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLogs, type AuditActorType } from "@/db/schema/audit-log";
import { projects, type Project } from "@/db/schema/project";
import { skills, type Skill } from "@/db/schema/skill";
import { skillOutcomes, type SkillOutcomeSeverity, type SkillOutcomeVerdict } from "@/db/schema/skill-outcome";
import { getActionContext } from "@/lib/auth/context";

export const AUDIT_SCOPES = ["all", "skills", "plans", "projects", "approvals", "deployments"] as const;
export type AuditScope = (typeof AUDIT_SCOPES)[number];

export type UnifiedAuditRow = {
  id: string;
  occurredAt: Date;
  source: "audit_log" | "skill_outcome";
  actorType: AuditActorType | "skill";
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  projectId: string | null;
  projectName: string | null;
  summary: string | null;
  severity: SkillOutcomeSeverity | null;
  verdict: SkillOutcomeVerdict | null;
  signature: string;
};

export type AuditQuery = {
  scope: AuditScope;
  from: Date;
  to: Date;
  actorType?: AuditActorType;
  limit?: number;
};

const SCOPE_ENTITY_FILTER: Record<AuditScope, string[] | null> = {
  all: null,
  skills: ["skill", "skill_outcome", "skill_autonomy"],
  plans: ["plan", "plan_revision"],
  projects: ["project", "phase_gate"],
  approvals: ["approval"],
  deployments: ["deployment"],
};

function hashSignature(parts: Array<string | number | null | undefined>): string {
  // Fallback for rows that don't have a chain-computed row_hash (e.g.
  // skill_outcomes — not chained yet, and the in-memory fixture rows used
  // before any real data lands). Stable short hash; reproducible per row.
  // Not cryptographic. The real audit_logs.row_hash takes precedence in
  // `unifiedSignature()` below.
  const s = parts.map((p) => (p == null ? "" : String(p))).join("|");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return ((h >>> 0).toString(16) + (s.length.toString(16))).padStart(10, "0").slice(0, 10);
}

function fixtureRows(orgId: string): UnifiedAuditRow[] {
  const now = Date.now();
  const at = (minsAgo: number) => new Date(now - minsAgo * 60_000);
  const mk = (
    o: Partial<UnifiedAuditRow> & Pick<UnifiedAuditRow, "occurredAt" | "action" | "entityType" | "entityId">,
  ): UnifiedAuditRow => ({
    id: `fx-${o.entityId}-${o.occurredAt.getTime()}`,
    source: "audit_log",
    actorType: "system",
    actorName: null,
    entityLabel: null,
    projectId: null,
    projectName: null,
    summary: null,
    severity: null,
    verdict: null,
    signature: hashSignature([orgId, o.action, o.entityType, o.entityId, o.occurredAt.getTime()]),
    ...o,
  });
  return [
    mk({
      occurredAt: at(12),
      action: "skill.invocation",
      entityType: "skill_outcome",
      entityId: "doc-updater-2042",
      actorType: "skill",
      actorName: "doc-updater",
      entityLabel: "doc-updater",
      projectName: "docs-portal",
      summary: "Auto-merged README typo fix",
      verdict: "success",
    }),
    mk({
      occurredAt: at(35),
      action: "plan.status",
      entityType: "plan",
      entityId: "pl_2k9a",
      actorType: "user",
      actorName: "Sam Chen",
      entityLabel: "Add 2FA enforcement",
      projectName: "auth-service",
      summary: "in_review → approved",
    }),
    mk({
      occurredAt: at(91),
      action: "phase_gate.advance",
      entityType: "phase_gate",
      entityId: "pg_82lk",
      actorType: "user",
      actorName: "Sam Chen",
      entityLabel: "design → development",
      projectName: "billing-v2",
      summary: "All 4 gate criteria passed",
    }),
    mk({
      occurredAt: at(143),
      action: "skill.demotion",
      entityType: "skill_autonomy",
      entityId: "smr-7281",
      actorType: "system",
      actorName: "autonomy-engine",
      entityLabel: "schema-migration-reviewer",
      projectName: "billing-v2",
      summary: "SENIOR → JUNIOR — rolled_back × 2 in 7d",
      severity: "high",
      verdict: "rolled_back",
    }),
    mk({
      occurredAt: at(220),
      action: "approval.decision",
      entityType: "approval",
      entityId: "ap_4nf2",
      actorType: "user",
      actorName: "Priya Subramanian",
      entityLabel: "release-plan: payouts-v3.4",
      projectName: "payouts",
      summary: "approved",
    }),
    mk({
      occurredAt: at(360),
      action: "deployment.event",
      entityType: "deployment",
      entityId: "dp_092p",
      actorType: "integration",
      actorName: "github-actions",
      entityLabel: "v3.4.0 → production",
      projectName: "payouts",
      summary: "success · commit a91f23e",
    }),
    mk({
      occurredAt: at(720),
      action: "rule.violation",
      entityType: "rule",
      entityId: "rl_8nk2",
      actorType: "system",
      actorName: "rule-engine",
      entityLabel: "no-direct-db-import",
      projectName: "auth-service",
      summary: "Violation in plan pl_2k9a — flagged for review",
      severity: "low",
    }),
    mk({
      occurredAt: at(1440),
      action: "skill.promotion",
      entityType: "skill_autonomy",
      entityId: "du-001",
      actorType: "system",
      actorName: "autonomy-engine",
      entityLabel: "doc-updater",
      summary: "JUNIOR → SENIOR — 47 successes, 0 rollbacks in 30d",
      verdict: "success",
    }),
  ];
}

export async function queryAuditLog(query: AuditQuery): Promise<UnifiedAuditRow[]> {
  const ctx = await getActionContext();
  const limit = query.limit ?? 200;

  const entityFilter = SCOPE_ENTITY_FILTER[query.scope];

  // 1. Domain audit_logs
  const auditConditions: SQL[] = [
    eq(auditLogs.organizationId, ctx.organizationId),
    gte(auditLogs.createdAt, query.from),
    lte(auditLogs.createdAt, query.to),
  ];
  if (query.actorType) auditConditions.push(eq(auditLogs.actorType, query.actorType));
  if (entityFilter) auditConditions.push(inArray(auditLogs.entityType, entityFilter));

  const auditPromise = db
    .select()
    .from(auditLogs)
    .where(and(...auditConditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  // 2. Skill outcomes — only when scope includes skills
  const includeSkillOutcomes =
    query.scope === "all" || query.scope === "skills";
  const outcomesPromise = includeSkillOutcomes
    ? db
        .select({
          outcome: skillOutcomes,
          skill: skills,
        })
        .from(skillOutcomes)
        .leftJoin(skills, eq(skillOutcomes.skillId, skills.id))
        .where(
          and(
            eq(skillOutcomes.organizationId, ctx.organizationId),
            gte(skillOutcomes.recordedAt, query.from),
            lte(skillOutcomes.recordedAt, query.to),
          ),
        )
        .orderBy(desc(skillOutcomes.recordedAt))
        .limit(limit)
    : Promise.resolve([] as Array<{ outcome: typeof skillOutcomes.$inferSelect; skill: Skill | null }>);

  const [auditRows, outcomeRows] = await Promise.all([auditPromise, outcomesPromise]);

  // Pull projects referenced in audit rows for project name resolution.
  const projectIds = new Set<string>();
  for (const a of auditRows) {
    if (a.entityType === "project") projectIds.add(a.entityId);
  }
  const projectsById = new Map<string, Project>();
  if (projectIds.size > 0) {
    const rows = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.organizationId, ctx.organizationId), inArray(projects.id, [...projectIds])),
      );
    for (const p of rows) projectsById.set(p.id, p);
  }

  const unified: UnifiedAuditRow[] = [];
  for (const a of auditRows) {
    const proj = projectsById.get(a.entityId);
    unified.push({
      id: a.id,
      occurredAt: a.createdAt,
      source: "audit_log",
      actorType: a.actorType,
      actorName: a.actorName,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      entityLabel: null,
      projectId: proj?.id ?? null,
      projectName: proj?.name ?? null,
      summary: a.summary,
      severity: null,
      verdict: null,
      // Prefer the chain-computed row_hash (sha256) when present — that's
      // the value the verifier walks. Fall back to the stable short hash
      // for rows inserted before the trigger landed and not yet backfilled.
      signature:
        a.rowHash?.slice(0, 12) ??
        hashSignature([
          a.organizationId,
          a.id,
          a.action,
          a.entityType,
          a.entityId,
          a.createdAt.getTime(),
        ]),
    });
  }
  for (const { outcome, skill } of outcomeRows) {
    unified.push({
      id: outcome.id,
      occurredAt: outcome.recordedAt,
      source: "skill_outcome",
      actorType: "skill",
      actorName: skill?.slug ?? skill?.name ?? null,
      action: `skill.${outcome.verdict}`,
      entityType: "skill_outcome",
      entityId: outcome.id,
      entityLabel: skill?.name ?? skill?.slug ?? null,
      projectId: skill?.projectId ?? null,
      projectName: null,
      summary: outcome.severity ? `severity: ${outcome.severity}` : null,
      severity: outcome.severity,
      verdict: outcome.verdict,
      signature: hashSignature([
        outcome.organizationId,
        outcome.id,
        outcome.verdict,
        outcome.skillId,
        outcome.recordedAt.getTime(),
      ]),
    });
  }

  // Merge & sort.
  unified.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  if (unified.length === 0) {
    return fixtureRows(ctx.organizationId).filter(
      (r) =>
        r.occurredAt >= query.from &&
        r.occurredAt <= query.to &&
        (!query.actorType || r.actorType === query.actorType) &&
        (!entityFilter || entityFilter.includes(r.entityType)),
    );
  }

  return unified.slice(0, limit);
}

export function rowsToCsv(rows: UnifiedAuditRow[]): string {
  const header = [
    "timestamp",
    "source",
    "action",
    "actor_type",
    "actor",
    "entity_type",
    "entity_id",
    "entity_label",
    "project",
    "summary",
    "verdict",
    "severity",
    "signature",
  ].join(",");
  const escape = (v: string | null | undefined): string => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const body = rows
    .map((r) =>
      [
        r.occurredAt.toISOString(),
        r.source,
        r.action,
        r.actorType,
        r.actorName,
        r.entityType,
        r.entityId,
        r.entityLabel,
        r.projectName,
        r.summary,
        r.verdict,
        r.severity,
        r.signature,
      ]
        .map(escape)
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}\n`;
}
