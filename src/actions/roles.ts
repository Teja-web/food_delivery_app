"use server";

import {
  getRoles as _getRoles,
  getRole as _getRole,
  getRoleDetail as _getRoleDetail,
  createRole as _createRole,
  updateRole as _updateRole,
  deleteRole as _deleteRole,
  searchRoles as _searchRoles,
  getRoleActivityLog as _getRoleActivityLog,
  replaceInterviewStages,
  listApplicationsForRole as _listApplicationsForRole,
  listRecommendationsForRole as _listRecommendationsForRole,
  getRolePipelineSmartCounts as _getRolePipelineSmartCounts,
  getRoleRecommendedSmartCounts as _getRoleRecommendedSmartCounts,
  fetchAllMatchingApplicationIds as _fetchAllMatchingApplicationIds,
  listRolesForPerformanceReport,
  getRolePublicMeta as _getRolePublicMeta,
  setRolePublicVisibility as _setRolePublicVisibility,
  VisibilityError,
} from "../operations/roles";
import type { PublicVisibility } from "@/db/schema/roles";
import { bucketSize as _bucketSize } from "@/lib/anonymize/k-anonymity";
import { getOrgPublicProfile } from "@/operations/organization";
import { runRoleWizard } from "@/automations/tasks/role-wizard";
import type { RoleWizardOutput } from "@/automations/agents/definitions/role-wizard";
import type { RoleWizardContext } from "@/automations/agents/prompts/role-wizard";
import { getActionContext } from "@/lib/auth/context";
import { storeFile } from "@/lib/storage";
import { extractTextFromFile } from "@/lib/markitdown";
import { generate } from "@/lib/ai";
import { roleFieldEnricherAgent } from "@/automations/agents/definitions/role-field-enricher";
import { roleFieldEnricherPromptWithContext } from "@/automations/agents/prompts/role-field-enricher";
import { db } from "@/db/client";
import { roles, orgIdentity } from "@/db/schema";
import { organization } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import type { RoleCriteriaConfig } from "@/db/schema/roles";
import { roleStatusReporterAgent, roleStatusReporterSchema, type RoleStatusReport, type RoleReportMetrics } from "@/automations/agents/definitions/role-status-reporter";
import { roleStatusReporterPromptWithContext } from "@/automations/agents/prompts/role-status-reporter";
import { performanceReporterAgent, performanceReportAISchema, type PerformanceReport, type PerformanceReportMetrics } from "@/automations/agents/definitions/performance-reporter";
import { performanceReporterPromptWithContext } from "@/automations/agents/prompts/performance-reporter";
import { roleSocialPostsAgent, roleSocialPostsSchema, type RoleSocialPosts } from "@/automations/agents/definitions/role-social-posts";
import { STALE_THRESHOLD_DAYS } from "@/lib/pipeline-stage";
import { roleSocialPostsPromptWithContext } from "@/automations/agents/prompts/role-social-posts";

export async function listRoles(opts?: {
  offset?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  where?: (table: any) => any;
}) {
  return _getRoles(opts);
}

export async function searchRoles(query: string, opts?: { offset?: number; limit?: number }) {
  return _searchRoles(query, opts);
}

const OPEN_STATUSES = ["open", "draft"];
const CLOSED_STATUSES = ["filled", "cancelled"];

export async function listOpenRoles(opts?: { offset?: number; limit?: number }) {
  const { inArray } = await import("drizzle-orm");
  return _getRoles({
    ...opts,
    where: (t: any) => inArray(t.status, OPEN_STATUSES),
  });
}

export async function listClosedRoles(opts?: { offset?: number; limit?: number }) {
  const { inArray } = await import("drizzle-orm");
  return _getRoles({
    ...opts,
    where: (t: any) => inArray(t.status, CLOSED_STATUSES),
  });
}

export async function fetchRole(id: string) {
  return _getRole(id);
}

export async function fetchRoleDetail(id: string) {
  return _getRoleDetail(id);
}

export async function listApplicationsForRole(
  roleId: string,
  opts?: Parameters<typeof _listApplicationsForRole>[1],
) {
  return _listApplicationsForRole(roleId, opts);
}

export async function getRolePipelineSmartCounts(roleId: string) {
  return _getRolePipelineSmartCounts(roleId);
}

export async function getRoleRecommendedSmartCounts(roleId: string) {
  return _getRoleRecommendedSmartCounts(roleId);
}

export async function fetchAllMatchingApplicationIds(
  roleId: string,
  opts?: Parameters<typeof _fetchAllMatchingApplicationIds>[1],
) {
  return _fetchAllMatchingApplicationIds(roleId, opts);
}

export async function listRecommendationsForRole(
  roleId: string,
  opts?: { offset?: number; limit?: number },
) {
  return _listRecommendationsForRole(roleId, opts);
}

/**
 * Fetch + serialize a page of applications for a role (for client-side pagination).
 */
export async function fetchApplicationsPage(
  roleId: string,
  opts?: {
    offset?: number;
    limit?: number;
    stage?: string | string[];
    q?: string;
    sortBy?: "createdAt" | "updatedAt" | "daysInStage";
    sortOrder?: "asc" | "desc";
    stale?: boolean;
    decisionReady?: boolean;
  },
) {
  const { serializeApplicationsPage } = await import("@/app/recruit/roles/[id]/serialize");
  const { fetchLatestNotePerEntity } = await import("@/actions/entity-notes");

  const role = await db.query.roles.findFirst({
    where: eq(roles.id, roleId),
    columns: { criteriaConfig: true },
    with: { interviewStages: true },
  });
  if (!role) return { items: [], total: 0 };

  const result = await _listApplicationsForRole(roleId, opts);
  const appNotesMap = await fetchLatestNotePerEntity(
    "application",
    result.items.map((a) => a.id),
  );
  const items = serializeApplicationsPage(
    result.items as any,
    role.criteriaConfig as any,
    (role as any).interviewStages ?? [],
    appNotesMap,
  );
  return { items, total: result.total };
}

/**
 * Fetch + serialize a page of recommendations for a role (for client-side pagination).
 */
export async function fetchRecommendationsPage(
  roleId: string,
  opts?: {
    offset?: number;
    limit?: number;
    recommendation?: string | string[];
    q?: string;
    sortBy?: "fitScore" | "matchedAt" | "updatedAt";
    sortOrder?: "asc" | "desc";
    recencyDays?: number;
  },
) {
  const { serializeRecommendationsPage } = await import("@/app/recruit/roles/[id]/serialize");

  const role = await db.query.roles.findFirst({
    where: eq(roles.id, roleId),
    columns: { criteriaConfig: true },
  });
  if (!role) return { items: [], total: 0 };

  const result = await _listRecommendationsForRole(roleId, opts);
  const items = serializeRecommendationsPage(
    result.items as any,
    role.criteriaConfig as any,
  );
  return { items, total: result.total };
}

async function fetchRoleActivityLog(
  roleId: string,
  related?: { application?: string[]; match?: string[] },
) {
  return _getRoleActivityLog(roleId, related);
}

import type { InterviewStageInput } from "../operations/roles";

export async function addRole(data: Record<string, unknown>, stages?: InterviewStageInput[]) {
  const role = await _createRole(data);
  if (stages?.length) {
    await replaceInterviewStages(role.id, stages);
  }
  return role;
}

export async function editRole(id: string, data: Record<string, unknown>, stages?: InterviewStageInput[]) {
  const role = await _updateRole(id, data);
  if (stages) {
    await replaceInterviewStages(id, stages);
  }
  return role;
}

async function removeRole(id: string) {
  return _deleteRole(id);
}

/**
 * Fetch company context for role wizard to generate company-specific job posts.
 */
async function getCompanyContext(organizationId: string): Promise<RoleWizardContext["companyContext"] | undefined> {
  const [org, identity] = await Promise.all([
    db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
      columns: { name: true, industry: true },
    }),
    (db as any).query.orgIdentity.findFirst({
      where: eq(orgIdentity.organizationId, organizationId),
    }),
  ]);

  if (!org) return undefined;

  const extracted = identity?.extractedIdentity;
  return {
    name: org.name,
    industry: org.industry,
    values: extracted?.values ?? undefined,
    culturalSignals: extracted?.culturalSignals ?? undefined,
    hiringPrinciples: extracted?.hiringPrinciples ?? undefined,
    summary: extracted?.summary ?? undefined,
  };
}

/**
 * Upload a JD file and run the role wizard agent to extract + generate all fields.
 */
export async function extractJd(formData: FormData): Promise<{ data?: RoleWizardOutput; error?: string }> {
  try {
    const ctx = await getActionContext();
    const file = formData.get("file") as File | null;
    const pastedText = formData.get("text") as string | null;

    let documentText: string;

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const stored = await storeFile(ctx.organizationId, "uploads", file.name, buffer);
      const extracted = await extractTextFromFile(stored.path);
      documentText = extracted.text;
    } else if (pastedText?.trim()) {
      documentText = pastedText;
    } else {
      return { error: "No file or text provided." };
    }

    const companyContext = await getCompanyContext(ctx.organizationId);
    const data = await runRoleWizard({ documentText, companyContext });
    return { data };
  } catch (error) {
    console.error("[extractJd] Error:", error);
    return { error: error instanceof Error ? error.message : "Extraction failed" };
  }
}

/**
 * Run the role wizard agent with current form state to generate/refine downstream fields.
 */
export async function generateRoleFields(
  formState: RoleWizardContext["formState"],
): Promise<{ data?: RoleWizardOutput; error?: string }> {
  try {
    const ctx = await getActionContext();
    const companyContext = await getCompanyContext(ctx.organizationId);
    const data = await runRoleWizard({ formState, companyContext });
    return { data };
  } catch (error) {
    console.error("[generateRoleFields] Error:", error);
    return { error: error instanceof Error ? error.message : "Generation failed" };
  }
}

/**
 * Compute all quantitative metrics for a role's pipeline — pure math, no AI.
 */
function computeRoleMetrics(role: any): RoleReportMetrics {
  const now = Date.now();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysOpen = Math.max(1, Math.floor((now - new Date(role.createdAt).getTime()) / msPerDay));
  const apps: any[] = role.applications ?? [];
  const totalCandidates = apps.length;

  // Per-candidate data with pre-generated intelligence
  const candidates = apps.map((app: any) => {
    const createdMs = new Date(app.createdAt).getTime();
    const updatedMs = new Date(app.updatedAt).getTime();
    const daysSinceLastActivity = Math.max(0, Math.floor((now - updatedMs) / msPerDay));
    const isActive = !["rejected", "withdrawn", "hired"].includes(app.stage);

    // Build interview summary from existing scorecard data
    let interviewSummary: string | null = null;
    if (app.interviews?.length) {
      const details = app.interviews.map((iv: any) => {
        const parts: string[] = [iv.status];
        if (iv.scorecards?.length) {
          const scores = iv.scorecards.filter((sc: any) => sc.overallRating != null).map((sc: any) => sc.overallRating);
          if (scores.length) parts.push(`avg score: ${Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)}/5`);
        }
        return parts.join(" - ");
      });
      interviewSummary = `${app.interviews.length} interview(s): ${details.join("; ")}`;
    }

    return {
      candidateId: app.candidateId,
      name: app.candidate?.name ?? "Unknown",
      currentStage: app.stage as string,
      source: app.source ?? "direct",
      daysInPipeline: Math.max(0, Math.floor((now - createdMs) / msPerDay)),
      daysInStage: app.daysInStage ?? Math.max(0, Math.floor((now - updatedMs) / msPerDay)),
      daysSinceLastActivity,
      isStale: isActive && daysSinceLastActivity >= STALE_THRESHOLD_DAYS,
      // Pre-generated match intelligence
      fitScore: app.match?.fitScore ?? null,
      signal: app.match?.signal ?? null,
      gaps: (app.match?.gaps ?? []) as string[],
      summary: app.match?.summary ?? null,
      // Interview intelligence
      interviewSummary,
    };
  });

  // Stage breakdown
  const stageCounts: Record<string, number> = {};
  for (const app of apps) {
    stageCounts[app.stage] = (stageCounts[app.stage] || 0) + 1;
  }
  const byStage = Object.entries(stageCounts).map(([stage, count]) => ({
    stage,
    count,
    percentage: totalCandidates > 0 ? Math.round((count / totalCandidates) * 100) : 0,
  }));

  // Conversion rate: advanced past "sourced"
  const advancedCount = apps.filter((a: any) => a.stage !== "sourced").length;
  const conversionRate = totalCandidates > 0 ? `${Math.round((advancedCount / totalCandidates) * 100)}%` : "N/A";

  // Average time in pipeline (active candidates only)
  const activeCandidates = candidates.filter((c) => !["rejected", "withdrawn", "hired"].includes(c.currentStage));
  const avgPipelineDays = activeCandidates.length > 0
    ? Math.round(activeCandidates.reduce((sum, c) => sum + c.daysInPipeline, 0) / activeCandidates.length)
    : 0;
  const averageTimeInPipeline = `${avgPipelineDays} days`;

  // Source effectiveness
  const sourceMap: Record<string, { count: number; advanced: number }> = {};
  for (const app of apps) {
    const src = app.source ?? "direct";
    if (!sourceMap[src]) sourceMap[src] = { count: 0, advanced: 0 };
    sourceMap[src].count++;
    if (app.stage !== "sourced") sourceMap[src].advanced++;
  }
  const sourceEffectiveness = Object.entries(sourceMap).map(([source, data]) => ({
    source,
    count: data.count,
    advancedCount: data.advanced,
    conversionRate: data.count > 0 ? `${Math.round((data.advanced / data.count) * 100)}%` : "0%",
  }));

  // Interview velocity
  const allInterviews = apps.flatMap((app: any) => (app.interviews ?? []).map((iv: any) => ({ ...iv, appCreatedAt: app.createdAt })));
  const scheduled = allInterviews.filter((iv: any) => iv.scheduledAt);
  const completed = allInterviews.filter((iv: any) => iv.status === "completed");
  const pending = allInterviews.filter((iv: any) => ["proposed", "confirmed"].includes(iv.status));

  const daysToSchedule = scheduled
    .map((iv: any) => Math.max(0, Math.floor((new Date(iv.scheduledAt).getTime() - new Date(iv.appCreatedAt).getTime()) / msPerDay)))
    .filter((d: number) => d >= 0);
  const avgSchedule = daysToSchedule.length > 0 ? Math.round(daysToSchedule.reduce((a: number, b: number) => a + b, 0) / daysToSchedule.length) : 0;

  const daysToComplete = completed
    .filter((iv: any) => iv.scheduledAt)
    .map((iv: any) => Math.max(0, Math.floor((new Date(iv.updatedAt).getTime() - new Date(iv.scheduledAt).getTime()) / msPerDay)));
  const avgComplete = daysToComplete.length > 0 ? Math.round(daysToComplete.reduce((a: number, b: number) => a + b, 0) / daysToComplete.length) : 0;

  // Scorecard completion
  const completedInterviews = allInterviews.filter((iv: any) => iv.status === "completed");
  const totalExpectedScorecards = completedInterviews.reduce((sum: number, iv: any) => sum + Math.max(1, (iv.panelists?.length ?? 0)), 0);
  const totalCompletedScorecards = completedInterviews.reduce((sum: number, iv: any) => sum + (iv.scorecards?.length ?? 0), 0);
  const completionRate = totalExpectedScorecards > 0 ? `${Math.round((totalCompletedScorecards / totalExpectedScorecards) * 100)}%` : "N/A";

  // Pending reviewers
  const pendingReviewers: Array<{ interviewId: string; candidateName: string; reviewerName: string }> = [];
  for (const app of apps) {
    for (const iv of app.interviews ?? []) {
      if (iv.status !== "completed") continue;
      const scorecardReviewerIds = new Set((iv.scorecards ?? []).map((sc: any) => sc.reviewerId));
      for (const p of iv.panelists ?? []) {
        if (!scorecardReviewerIds.has(p.userId)) {
          pendingReviewers.push({
            interviewId: iv.id,
            candidateName: app.candidate?.name ?? "Unknown",
            reviewerName: p.user?.name ?? p.userId,
          });
        }
      }
    }
  }

  // Stage transitions (avg days in stage per stage)
  const stageTimeMap: Record<string, number[]> = {};
  for (const c of candidates) {
    if (!stageTimeMap[c.currentStage]) stageTimeMap[c.currentStage] = [];
    stageTimeMap[c.currentStage].push(c.daysInStage);
  }
  const stageTransitions = Object.entries(stageTimeMap).map(([stage, days]) => ({
    stage,
    avgDaysInStage: `${Math.round(days.reduce((a, b) => a + b, 0) / days.length)} days`,
    candidateCount: days.length,
  }));

  // Drop-off analysis
  const rejectedByStage: Record<string, number> = {};
  const withdrawnByStage: Record<string, number> = {};
  for (const app of apps) {
    // We track rejected/withdrawn as stages, so candidates in those stages dropped off
    // We don't know which stage they dropped FROM without history, so we group them
    if (app.stage === "rejected") {
      const key = "pipeline";
      rejectedByStage[key] = (rejectedByStage[key] || 0) + 1;
    } else if (app.stage === "withdrawn") {
      const key = "pipeline";
      withdrawnByStage[key] = (withdrawnByStage[key] || 0) + 1;
    }
  }
  const allDropStages = new Set([...Object.keys(rejectedByStage), ...Object.keys(withdrawnByStage)]);
  const dropOffAnalysis = Array.from(allDropStages).map((stage) => {
    const rejected = rejectedByStage[stage] || 0;
    const withdrawn = withdrawnByStage[stage] || 0;
    const total = rejected + withdrawn;
    return {
      stage,
      rejectedCount: rejected,
      withdrawnCount: withdrawn,
      totalDropped: total,
      dropOffRate: totalCandidates > 0 ? `${Math.round((total / totalCandidates) * 100)}%` : "0%",
    };
  });

  return {
    daysOpen,
    totalCandidates,
    conversionRate,
    averageTimeInPipeline,
    byStage,
    sourceEffectiveness,
    interviewVelocity: {
      totalScheduled: scheduled.length,
      totalCompleted: completed.length,
      avgDaysToSchedule: `${avgSchedule} days`,
      avgDaysToComplete: `${avgComplete} days`,
      pendingInterviews: pending.length,
    },
    scorecardCompletion: {
      totalExpected: totalExpectedScorecards,
      totalCompleted: totalCompletedScorecards,
      completionRate,
      pendingReviewers,
    },
    stageTransitions,
    dropOffAnalysis,
    candidates,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a comprehensive status report for a role's hiring pipeline.
 * Metrics are computed server-side; AI provides qualitative analysis only.
 */
export async function generateRoleReport(roleId: string): Promise<RoleStatusReport> {
  const role = await _getRoleDetail(roleId);
  if (!role) throw new Error("Role not found");

  // 1. Compute all metrics server-side
  const metrics = computeRoleMetrics(role);

  // 2. Build compact context for AI — metrics + candidate summary (no per-candidate analysis needed)
  const config = role.criteriaConfig as RoleCriteriaConfig | null;
  const criteriaText = config?.criteria
    ?.map((c) => `- ${c.name} [${c.weight}]: ${c.description}`)
    .join("\n") ?? "No criteria configured";

  const metricsSnapshot = [
    `Total candidates: ${metrics.totalCandidates}`,
    `Conversion rate: ${metrics.conversionRate}`,
    `Avg time in pipeline: ${metrics.averageTimeInPipeline}`,
    `Stage breakdown: ${metrics.byStage.map((s) => `${s.stage}=${s.count}`).join(", ")}`,
    `Sources: ${metrics.sourceEffectiveness.map((s) => `${s.source}=${s.count} (${s.conversionRate} conversion)`).join(", ")}`,
    `Interviews: ${metrics.interviewVelocity.totalScheduled} scheduled, ${metrics.interviewVelocity.totalCompleted} completed, ${metrics.interviewVelocity.pendingInterviews} pending`,
    `Avg days to schedule: ${metrics.interviewVelocity.avgDaysToSchedule}, avg to complete: ${metrics.interviewVelocity.avgDaysToComplete}`,
    `Scorecard completion: ${metrics.scorecardCompletion.completionRate} (${metrics.scorecardCompletion.totalCompleted}/${metrics.scorecardCompletion.totalExpected})`,
    metrics.scorecardCompletion.pendingReviewers.length > 0
      ? `Pending reviewers: ${metrics.scorecardCompletion.pendingReviewers.map((r) => `${r.reviewerName} for ${r.candidateName}`).join(", ")}`
      : null,
    `Stage avg time: ${metrics.stageTransitions.map((s) => `${s.stage}=${s.avgDaysInStage}`).join(", ")}`,
    metrics.dropOffAnalysis.length > 0
      ? `Drop-off: ${metrics.dropOffAnalysis.map((d) => `${d.rejectedCount} rejected, ${d.withdrawnCount} withdrawn (${d.dropOffRate})`).join("; ")}`
      : null,
  ].filter(Boolean).join("\n");

  // Compact candidate summary for AI context (not per-candidate analysis)
  const activeCandidates = metrics.candidates.filter((c) => !["rejected", "withdrawn", "hired"].includes(c.currentStage));
  const candidateSnapshot = activeCandidates.map((c) =>
    `- ${c.name} | ${c.currentStage} | fit:${c.fitScore ?? "N/A"} | ${c.daysInPipeline}d in pipeline | ${c.daysSinceLastActivity}d inactive${c.isStale ? " [STALE]" : ""}`
  ).join("\n") || "No active candidates.";

  const prompt = roleStatusReporterPromptWithContext({
    roleTitle: role.title,
    department: role.department ?? null,
    location: role.location ?? null,
    daysOpen: metrics.daysOpen,
    headcount: role.headcount ?? null,
    criteria: criteriaText,
    metricsSnapshot,
    candidateSnapshot,
  });

  // 3. AI generates qualitative analysis only
  const result = await generate({
    agent: roleStatusReporterAgent,
    prompt,
    output: roleStatusReporterSchema,
  });

  return { metrics, analysis: result.object };
}

/**
 * Compute aggregated metrics across multiple roles — pure math, no AI.
 */
function computePerformanceMetrics(
  reportType: "recruiter" | "hiring_manager" | "department",
  subjectName: string,
  rolesList: any[],
): PerformanceReportMetrics {
  const now = Date.now();
  const msPerDay = 1000 * 60 * 60 * 24;

  const activeStatuses = new Set(["draft", "open", "active"]);
  const activeRoles = rolesList.filter((r: any) => activeStatuses.has(r.status));

  let totalCandidates = 0;
  let totalAdvanced = 0;
  let totalDaysOpen = 0;
  const sourceMap: Record<string, { count: number; advanced: number }> = {};
  let totalInterviews = 0;
  let completedInterviews = 0;
  let totalExpectedScorecards = 0;
  let totalCompletedScorecards = 0;
  const scheduleDays: number[] = [];
  const fillDays: number[] = [];

  const roleSnapshots = rolesList.map((role: any) => {
    const daysOpen = Math.max(1, Math.floor((now - new Date(role.createdAt).getTime()) / msPerDay));
    totalDaysOpen += daysOpen;
    const apps: any[] = role.applications ?? [];
    const roleCandidates = apps.length;
    totalCandidates += roleCandidates;
    const roleAdvanced = apps.filter((a: any) => a.stage !== "sourced").length;
    totalAdvanced += roleAdvanced;

    // Sources
    for (const app of apps) {
      const src = app.source ?? "direct";
      if (!sourceMap[src]) sourceMap[src] = { count: 0, advanced: 0 };
      sourceMap[src].count++;
      if (app.stage !== "sourced") sourceMap[src].advanced++;
    }

    // Interviews
    for (const app of apps) {
      for (const iv of app.interviews ?? []) {
        totalInterviews++;
        if (iv.status === "completed") {
          completedInterviews++;
          const expected = Math.max(1, iv.panelists?.length ?? 0);
          totalExpectedScorecards += expected;
          totalCompletedScorecards += iv.scorecards?.length ?? 0;
        }
        if (iv.scheduledAt && app.createdAt) {
          scheduleDays.push(Math.max(0, Math.floor((new Date(iv.scheduledAt).getTime() - new Date(app.createdAt).getTime()) / msPerDay)));
        }
      }

      // Time to fill
      if (app.hiredAt && app.createdAt) {
        fillDays.push(Math.max(0, Math.floor((new Date(app.hiredAt).getTime() - new Date(app.createdAt).getTime()) / msPerDay)));
      }
    }

    return {
      roleId: role.id as string,
      roleTitle: role.title as string,
      department: (role.department ?? null) as string | null,
      status: role.status as string,
      daysOpen,
      totalCandidates: roleCandidates,
      conversionRate: roleCandidates > 0 ? `${Math.round((roleAdvanced / roleCandidates) * 100)}%` : "N/A",
    };
  });

  const avgSchedule = scheduleDays.length > 0 ? Math.round(scheduleDays.reduce((a, b) => a + b, 0) / scheduleDays.length) : 0;

  return {
    reportType,
    reportSubject: subjectName,
    totalRoles: rolesList.length,
    activeRoles: activeRoles.length,
    totalCandidates,
    overallConversionRate: totalCandidates > 0 ? `${Math.round((totalAdvanced / totalCandidates) * 100)}%` : "N/A",
    avgDaysOpen: rolesList.length > 0 ? `${Math.round(totalDaysOpen / rolesList.length)} days` : "N/A",
    avgTimeToFill: fillDays.length > 0 ? `${Math.round(fillDays.reduce((a, b) => a + b, 0) / fillDays.length)} days` : "N/A",
    roleSnapshots,
    sourceEffectiveness: Object.entries(sourceMap).map(([source, data]) => ({
      source,
      totalCount: data.count,
      totalAdvanced: data.advanced,
      conversionRate: data.count > 0 ? `${Math.round((data.advanced / data.count) * 100)}%` : "0%",
    })),
    interviewMetrics: {
      totalInterviews,
      completedInterviews,
      avgDaysToSchedule: `${avgSchedule} days`,
      scorecardCompletionRate: totalExpectedScorecards > 0 ? `${Math.round((totalCompletedScorecards / totalExpectedScorecards) * 100)}%` : "N/A",
      pendingScorecards: Math.max(0, totalExpectedScorecards - totalCompletedScorecards),
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate an aggregated performance report for a recruiter, hiring manager, or department.
 * Metrics are computed server-side; AI provides qualitative analysis only.
 */
export async function generatePerformanceReport(
  filter: { recruiterId: string; name: string } | { hiringManagerId: string; name: string } | { department: string },
): Promise<PerformanceReport> {
  const reportType: "recruiter" | "hiring_manager" | "department" =
    "recruiterId" in filter ? "recruiter" : "hiringManagerId" in filter ? "hiring_manager" : "department";
  const subjectName = "department" in filter && !("name" in filter) ? filter.department : (filter as any).name ?? (filter as any).department;

  const queryFilter = "recruiterId" in filter
    ? { recruiterId: filter.recruiterId }
    : "hiringManagerId" in filter
    ? { hiringManagerId: filter.hiringManagerId }
    : { department: filter.department };

  const rolesList = await listRolesForPerformanceReport(queryFilter);

  // 1. Compute all metrics server-side
  const metrics = computePerformanceMetrics(reportType, subjectName, rolesList);

  // 2. Build context for AI
  const now = Date.now();
  const msPerDay = 1000 * 60 * 60 * 24;

  const rolesForAI = rolesList.map((role: any) => {
    const daysOpen = Math.max(1, Math.floor((now - new Date(role.createdAt).getTime()) / msPerDay));
    const apps: any[] = role.applications ?? [];
    const advanced = apps.filter((a: any) => a.stage !== "sourced").length;

    return {
      roleId: role.id as string,
      roleTitle: role.title as string,
      department: (role.department ?? null) as string | null,
      status: role.status as string,
      daysOpen,
      totalCandidates: apps.length,
      conversionRate: apps.length > 0 ? `${Math.round((advanced / apps.length) * 100)}%` : "N/A",
      candidates: apps.slice(0, 15).map((app: any) => ({
        name: app.candidate?.name ?? "Unknown",
        stage: app.stage as string,
        source: (app.source ?? "direct") as string,
        fitScore: (app.match?.fitScore ?? null) as number | null,
        daysInPipeline: Math.max(0, Math.floor((now - new Date(app.createdAt).getTime()) / msPerDay)),
        daysSinceLastActivity: Math.max(0, Math.floor((now - new Date(app.updatedAt).getTime()) / msPerDay)),
      })),
    };
  });

  const metricsSnapshot = [
    `Total roles: ${metrics.totalRoles} (${metrics.activeRoles} active)`,
    `Total candidates: ${metrics.totalCandidates}`,
    `Overall conversion: ${metrics.overallConversionRate}`,
    `Avg days open: ${metrics.avgDaysOpen}`,
    `Avg time to fill: ${metrics.avgTimeToFill}`,
    `Sources: ${metrics.sourceEffectiveness.map((s) => `${s.source}=${s.totalCount} (${s.conversionRate})`).join(", ")}`,
    `Interviews: ${metrics.interviewMetrics.totalInterviews} total, ${metrics.interviewMetrics.completedInterviews} completed`,
    `Scorecard completion: ${metrics.interviewMetrics.scorecardCompletionRate} (${metrics.interviewMetrics.pendingScorecards} pending)`,
  ].join("\n");

  const prompt = performanceReporterPromptWithContext({
    reportType,
    subjectName,
    metricsSnapshot,
    roles: rolesForAI,
  });

  // 3. AI generates qualitative analysis only
  const result = await generate({
    agent: performanceReporterAgent,
    prompt,
    output: performanceReportAISchema,
  });

  return { metrics, analysis: result.object };
}

/**
 * Enrich a role field (description or businessCase) using AI.
 */
export async function enrichRoleField(
  fieldType: "description" | "businessCase",
  currentValue: string,
  context: {
    title?: string;
    team?: string;
    location?: string;
    department?: string;
    employmentType?: string;
    headcount?: number;
    businessCase?: string;
    description?: string;
  },
): Promise<{ enriched?: string; error?: string }> {
  try {
    const prompt = roleFieldEnricherPromptWithContext(fieldType, currentValue, context);

    const result = await generate({
      agent: roleFieldEnricherAgent,
      prompt,
    });

    return { enriched: result.text };
  } catch (error) {
    console.error("[enrichRoleField] Error:", error);
    return { error: error instanceof Error ? error.message : "Enrichment failed" };
  }
}

/**
 * Generate social media posts (LinkedIn + Twitter) for sharing a role.
 */
export async function generateRoleSocialPosts(roleId: string): Promise<RoleSocialPosts> {
  const role = await db.query.roles.findFirst({
    where: eq(roles.id, roleId),
    columns: {
      title: true,
      department: true,
      location: true,
      description: true,
      compensation: true,
      criteriaConfig: true,
      organizationId: true,
    },
  });

  if (!role) throw new Error("Role not found");

  // Fetch organization details for company context
  let companyName: string | null = null;
  let companyIndustry: string | null = null;
  if (role.organizationId) {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, role.organizationId),
      columns: { name: true, industry: true },
    });
    if (org) {
      companyName = org.name;
      companyIndustry = org.industry;
    }
  }

  const config = role.criteriaConfig as RoleCriteriaConfig | null;
  const requirements = config?.criteria
    ?.filter((c) => c.weight === "critical" || c.weight === "important")
    .map((c) => `- ${c.name}: ${c.description}`)
    .join("\n") ?? null;

  // Extract mandatory constraints from description and criteria
  const mandatoryPatterns = [
    /\b(must|required|mandatory|onsite|on-site|in-office|hybrid|remote only)\b/gi,
    /\b(degree required|bachelor'?s?|master'?s?|phd|certification required)\b/gi,
    /\b(visa sponsorship|work authorization|security clearance)\b/gi,
    /\b(\d+\+?\s*years?\s*(of\s*)?(experience|exp))\b/gi,
  ];

  const descriptionText = role.description ?? "";
  const constraintsFound: string[] = [];

  // Check for location constraints
  if (/\b(onsite|on-site|in-office|must be local)\b/i.test(descriptionText)) {
    constraintsFound.push(`Location: ${role.location ?? "Onsite required"}`);
  }
  if (/\bhybrid\b/i.test(descriptionText)) {
    constraintsFound.push("Work arrangement: Hybrid");
  }
  if (/\bremote only\b/i.test(descriptionText)) {
    constraintsFound.push("Work arrangement: Remote only");
  }

  // Check for education requirements
  const degreeMatch = descriptionText.match(/\b(bachelor'?s?|master'?s?|phd|degree required)\b/i);
  if (degreeMatch) {
    constraintsFound.push(`Education: ${degreeMatch[0]} required`);
  }

  // Check for experience requirements
  const expMatch = descriptionText.match(/\b(\d+\+?\s*years?\s*(of\s*)?(experience|exp))\b/i);
  if (expMatch) {
    constraintsFound.push(`Experience: ${expMatch[0]}`);
  }

  // Check criteria for mandatory items
  config?.criteria
    ?.filter((c) => c.weight === "critical")
    .forEach((c) => {
      if (!constraintsFound.some(cf => cf.toLowerCase().includes(c.name.toLowerCase()))) {
        constraintsFound.push(`${c.name}: Required`);
      }
    });

  const mandatoryConstraints = constraintsFound.length > 0
    ? constraintsFound.map(c => `- ${c}`).join("\n")
    : null;

  const comp = role.compensation as { min: number; max: number; currency?: string } | null;
  const compText = comp ? `${comp.currency || "$"}${Math.round(comp.min / 1000)}k - ${comp.currency || "$"}${Math.round(comp.max / 1000)}k` : null;

  const prompt = roleSocialPostsPromptWithContext({
    roleTitle: role.title,
    department: role.department,
    location: role.location,
    description: role.description,
    requirements,
    mandatoryConstraints,
    compensation: compText,
    companyName,
    companyIndustry,
  });

  const result = await generate({
    agent: roleSocialPostsAgent,
    prompt,
    output: roleSocialPostsSchema,
  });

  return result.object;
}

/* -- Public visibility ----------------------------------------------- */

export async function fetchRolePublicMeta(roleId: string) {
  return _getRolePublicMeta(roleId);
}

export type SetRolePublicVisibilityResult =
  | {
      ok: true;
      publicVisibility: PublicVisibility;
      publicSlug: string | null;
    }
  | { ok: false; reason: "no_public_profile" | "k_anonymity_blocked" };

export async function setRolePublicVisibilityAction(
  roleId: string,
  visibility: PublicVisibility,
): Promise<SetRolePublicVisibilityResult> {
  try {
    const result = await _setRolePublicVisibility(roleId, visibility);
    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof VisibilityError) {
      return { ok: false, reason: err.reason };
    }
    throw err;
  }
}

/**
 * Server-side k-anonymity check for the per-role visibility card.
 * Returns null if the org hasn't filled in a public profile yet.
 */
export async function fetchRoleVisibilityContext() {
  const profile = await getOrgPublicProfile();
  if (!profile) return { profile: null, bucket: null };
  const bucket = await _bucketSize(profile);
  return { profile, bucket };
}
