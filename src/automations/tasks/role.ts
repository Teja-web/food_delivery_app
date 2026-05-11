/**
 * role.health_analyzer — Assess role health from pipeline reality, update health + triage item.
 * role.match_pools — Batch match candidates from talent pools against this role.
 */

import { db } from "@/db/client";
import { roles, applications, triageItems, interviews } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { roleHealthAnalyzerPromptWithContext } from "../agents/prompts/role-health-analyzer";
import { roleHealthAnalyzerAgent, roleHealthAnalysisSchema } from "../agents/definitions/role-health-analyzer";
import { generate } from "@/lib/ai";

export async function roleIntake(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const { organizationId, entityId } = params;

  // -- Fetch role with full pipeline context --
  const role = await db.query.roles.findFirst({
    where: and(eq(roles.id, entityId), eq(roles.organizationId, organizationId)),
  });
  if (!role) return { skipped: true, reason: "role_not_found" };
  if (!role.criteriaConfig) return { skipped: true, reason: "no_criteria_config" };

  const apps = await db.query.applications.findMany({
    where: and(eq(applications.roleId, entityId), eq(applications.organizationId, organizationId)),
    with: { candidate: true, match: true, interviews: true },
  });

  // -- Build context strings --
  const criteriaText = role.criteriaConfig.criteria
    .map((c) => `[${c.weight}] ${c.category}: ${c.name} — ${c.description}`)
    .join("\n") || "No criteria configured";

  const comp = role.compensation
    ? `${role.compensation.currency || "$"}${role.compensation.min / 1000}k–${role.compensation.max / 1000}k`
    : "Not set";

  const targetDate = role.targetHireDate
    ? role.targetHireDate.toISOString().split("T")[0]
    : "Not set";

  const now = Date.now();
  const daysOpen = Math.max(1, Math.floor((now - new Date(role.createdAt).getTime()) / (1000 * 60 * 60 * 24)));

  // Pipeline: stage counts + per-candidate detail
  const stageCounts: Record<string, number> = {};
  for (const app of apps) {
    stageCounts[app.stage] = (stageCounts[app.stage] || 0) + 1;
  }
  const pipelineText = Object.entries(stageCounts)
    .map(([s, c]) => `${s}: ${c}`)
    .join(", ") || "Empty pipeline";

  // Top candidates with days in stage
  const activeApps = apps
    .filter((a) => !["rejected", "withdrawn", "hired"].includes(a.stage))
    .sort((a, b) => (b.match?.fitScore ?? 0) - (a.match?.fitScore ?? 0))
    .slice(0, 8);

  const topCandidatesText = activeApps.length > 0
    ? activeApps.map((a) => {
        const daysInStage = Math.floor((now - new Date(a.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
        return `${a.candidate?.name || "Unknown"} — stage: ${a.stage}, fit: ${a.match?.fitScore ?? "unscored"}, ${daysInStage}d in stage`;
      }).join("\n")
    : "No active candidates";

  // Interview outcomes
  const allInterviews = apps.flatMap((a) => (a.interviews || []).map((i) => ({ ...i, candidateName: a.candidate?.name })));
  const interviewText = allInterviews.length > 0
    ? allInterviews.map((i) => `${i.candidateName || "Unknown"}: ${i.status}`).join(", ")
    : "No interviews";

  // Match score distribution
  const scores = apps.map((a) => a.match?.fitScore).filter((s): s is number => s != null);
  const matchDistText = scores.length > 0
    ? `${scores.length} scored — avg: ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}, above 75: ${scores.filter((s) => s >= 75).length}, above 85: ${scores.filter((s) => s >= 85).length}`
    : "No match scores yet";

  // -- Generate --
  const prompt = roleHealthAnalyzerPromptWithContext({
    roleTitle: role.title,
    roleCriteria: criteriaText,
    compensation: comp,
    timeline: `Target hire date: ${targetDate}`,
    daysOpen,
    pipeline: pipelineText,
    topCandidates: topCandidatesText,
    interviewOutcomes: interviewText,
    matchDistribution: matchDistText,
  });

  const result = await generate({ agent: roleHealthAnalyzerAgent, prompt, output: roleHealthAnalysisSchema });
  const output = (result as any).object as typeof roleHealthAnalysisSchema._output;

  // -- Write: update role health --
  await db.update(roles)
    .set({ health: output.health, updatedAt: new Date() })
    .where(eq(roles.id, entityId));

  // -- Write: upsert triage item --
  const urgency = output.health === "stalled" ? "critical" : output.health === "at-risk" ? "high" : "low";

  const existing = await db.select({ id: triageItems.id })
    .from(triageItems)
    .where(and(
      eq(triageItems.organizationId, organizationId),
      eq(triageItems.roleId, entityId),
      eq(triageItems.type, "fulfilment"),
      eq(triageItems.status, "active"),
    ))
    .limit(1);

  if (existing.length > 0) {
    await db.update(triageItems)
      .set({
        urgency,
        title: output.headline,
        action: output.action,
        updatedAt: new Date(),
      })
      .where(eq(triageItems.id, existing[0].id));
  } else {
    await db.insert(triageItems).values({
      organizationId,
      roleId: entityId,
      type: "fulfilment",
      urgency,
      title: output.headline,
      action: output.action,
      status: "active",
    });
  }

  return { success: true, health: output.health, headline: output.headline };
}

/**
 * Wrapper for pipeline events where entityId is an application ID.
 * Resolves the roleId and runs fulfilment assessment.
 */
export async function roleHealthAnalyzerFromApplication(params: {
  organizationId: string;
  entityId: string;
  traceId?: string;
}) {
  const app = await db.query.applications.findFirst({
    where: eq(applications.id, params.entityId),
    columns: { roleId: true },
  });
  if (!app) return { skipped: true, reason: "application_not_found" };

  return roleIntake({ ...params, entityId: app.roleId });
}

// Re-export from match.ts — roleMatchPools is now evaluateMatchesForRole
// roleMatchPools is evaluateMatchesForRole from ./match
