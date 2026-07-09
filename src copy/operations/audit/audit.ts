/**
 * Audit operation — composes the unified audit-log view.
 *
 * Reads from `audit_logs` (domain-level state changes) and `skill_outcomes`
 * (every skill verdict) and normalizes both into a single chronological feed
 * for the /audit page (Audit log in the sidebar). Designed for the H7 "CISO 24-hour
 * drill" parameterized query → export workflow. An empty org yields an empty
 * list — operators bring data via `pnpm db:onboard --sample`.
 */

import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLogs, type AuditActorType } from "@/db/schema/audit/audit-log";
import { projects, type Project } from "@/db/schema/project";
import { skills, type Skill } from "@/db/schema/skill/skill";
import { skillOutcomes, type SkillOutcomeSeverity, type SkillOutcomeVerdict } from "@/db/schema/skill/skill-outcome";
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
  invokedVia: string | null;
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
  plans: ["plan", "project_task_revision", "work_item", "comment"],
  projects: ["project", "governance_record", "artifact"],
  approvals: ["approval"],
  deployments: ["deployment"],
};

function projectIdFromAuditPayload(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const projectId = (value as { projectId?: unknown }).projectId;
  return typeof projectId === "string" && projectId.trim().length > 0 ? projectId : null;
}

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
    const payloadProjectId =
      projectIdFromAuditPayload(a.after) ?? projectIdFromAuditPayload(a.before);
    if (payloadProjectId) projectIds.add(payloadProjectId);
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
    const payloadProjectId =
      projectIdFromAuditPayload(a.after) ?? projectIdFromAuditPayload(a.before);
    const proj = projectsById.get(payloadProjectId ?? a.entityId);
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
      invokedVia: a.invokedVia,
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
      invokedVia: null,
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
    "invoked_via",
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
        r.invokedVia,
        r.signature,
      ]
        .map(escape)
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}\n`;
}
