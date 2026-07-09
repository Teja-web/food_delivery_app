"use server";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { adapterBindings } from "@/db/schema/adapter-binding";
import { auditLogs } from "@/db/schema/audit/audit-log";
import { projectTasks } from "@/db/schema/plan/project-task";
import { getActionContext } from "@/lib/auth/context";
import { safeRevalidate } from "@/lib/safe-revalidate";
import {
  JIRA_PLAN_PUSH_ACTIONS,
  jiraPlanNeedsPush,
  pushPlanToJira,
} from "@/lib/integrations/outbound";
import { getOutboundBinding } from "@/operations/choreography/adapter-bindings";
import {
  backfillJiraRepositoryUrl,
  syncJiraProjectWorkItems,
} from "@/operations/integration/jira-projects";
import { jiraProjectKeyFromExternalKey } from "@/lib/integrations/jira-keys";

export async function pushPlanToJiraAction(planId: string) {
  const ctx = await getActionContext();
  const plan = await db.query.projectTasks.findFirst({
    where: and(eq(projectTasks.id, planId), eq(projectTasks.organizationId, ctx.organizationId)),
    columns: { id: true },
  });
  if (!plan) throw new Error("Plan not found.");
  const result = await pushPlanToJira(planId, { throwOnError: true });
  safeRevalidate(`/plans/${planId}`);
  return result;
}

export async function listJiraPushTargetsAction(input: {
  mode: "approved" | "all";
  projectId?: string | null;
}) {
  const ctx = await getActionContext();
  const where =
    input.mode === "approved"
      ? input.projectId
        ? and(
            eq(projectTasks.organizationId, ctx.organizationId),
            eq(projectTasks.projectId, input.projectId),
            eq(projectTasks.status, "approved"),
          )
        : and(
            eq(projectTasks.organizationId, ctx.organizationId),
            eq(projectTasks.status, "approved"),
          )
      : input.projectId
        ? and(
            eq(projectTasks.organizationId, ctx.organizationId),
            eq(projectTasks.projectId, input.projectId),
          )
        : eq(projectTasks.organizationId, ctx.organizationId);

  const plans = await db.query.projectTasks.findMany({
    where,
    columns: {
      id: true,
      projectId: true,
      title: true,
      status: true,
      externalRef: true,
      updatedAt: true,
      updatedById: true,
    },
  });
  if (plans.length === 0) return [];

  const projectIds = [...new Set(plans.map((plan) => plan.projectId))];
  const jiraBindings = await db.query.adapterBindings.findMany({
    where: and(
      eq(adapterBindings.organizationId, ctx.organizationId),
      eq(adapterBindings.provider, "jira"),
      inArray(adapterBindings.projectId, projectIds),
    ),
    columns: { projectId: true },
  });
  const jiraProjectIds = new Set(jiraBindings.map((binding) => binding.projectId));
  const jiraPlans = plans.filter((plan) => jiraProjectIds.has(plan.projectId));
  if (jiraPlans.length === 0) return [];

  const jiraPushAudits = await db.query.auditLogs.findMany({
    where: and(
      eq(auditLogs.organizationId, ctx.organizationId),
      eq(auditLogs.entityType, "plan"),
      inArray(auditLogs.entityId, jiraPlans.map((plan) => plan.id)),
      inArray(auditLogs.action, [...JIRA_PLAN_PUSH_ACTIONS]),
    ),
    orderBy: [desc(auditLogs.createdAt)],
    columns: { entityId: true, createdAt: true },
  });
  const lastPushByPlanId = new Map<string, Date>();
  for (const audit of jiraPushAudits) {
    if (!lastPushByPlanId.has(audit.entityId)) {
      lastPushByPlanId.set(audit.entityId, audit.createdAt);
    }
  }

  return jiraPlans.filter((plan) =>
    jiraPlanNeedsPush(plan, { lastPushedAt: lastPushByPlanId.get(plan.id) ?? null }),
  );
}

export async function pushApprovedPlansToJiraAction(projectId?: string | null) {
  const plans = await listJiraPushTargetsAction({ mode: "approved", projectId });

  const results = await Promise.allSettled(
    plans.map(async (plan) => ({
      planId: plan.id,
      title: plan.title,
      result: await pushPlanToJira(plan.id, { throwOnError: true }),
    })),
  );

  const failures = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return [];
    return [
      {
        planId: plans[index]?.id,
        title: plans[index]?.title ?? "Unknown plan",
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      },
    ];
  });

  safeRevalidate("/plans");
  if (projectId) safeRevalidate(`/projects/${projectId}/plans`);

  return {
    total: plans.length,
    pushed: results.filter((result) => result.status === "fulfilled").length,
    failed: failures.length,
    failures,
  };
}

export async function pushAllPlansToJiraAction(projectId?: string | null) {
  const plans = await listJiraPushTargetsAction({ mode: "all", projectId });

  const results = await Promise.allSettled(
    plans.map(async (plan) => ({
      planId: plan.id,
      title: plan.title,
      status: plan.status,
      result: await pushPlanToJira(plan.id, { throwOnError: true }),
    })),
  );

  const failures = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return [];
    return [
      {
        planId: plans[index]?.id,
        title: plans[index]?.title ?? "Unknown plan",
        status: plans[index]?.status ?? "unknown",
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      },
    ];
  });

  safeRevalidate("/plans");
  if (projectId) safeRevalidate(`/projects/${projectId}/plans`);

  return {
    total: plans.length,
    pushed: results.filter((result) => result.status === "fulfilled").length,
    failed: failures.length,
    failures,
  };
}

export async function syncJiraWorkItemsAction(projectId: string) {
  const ctx = await getActionContext();
  const binding = await getOutboundBinding(ctx.organizationId, projectId, "jira");
  if (!binding) {
    throw new Error("No Jira binding configured for this project.");
  }
  const projectKey = jiraProjectKeyFromExternalKey(binding.externalKey);
  const url = await backfillJiraRepositoryUrl({
    organizationId: ctx.organizationId,
    projectId,
    projectKey,
  });
  const syncedIssues = await syncJiraProjectWorkItems({
    organizationId: ctx.organizationId,
    projectId,
    projectKey,
  });
  safeRevalidate(`/projects/${projectId}/work-items`);
  safeRevalidate(`/projects/${projectId}/settings/repositories`);
  return { projectKey, syncedIssues, url };
}
