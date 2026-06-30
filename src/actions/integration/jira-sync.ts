"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { planArtifacts } from "@/db/schema/plan/plan-artifact";
import { getActionContext } from "@/lib/auth/context";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { pushPlanToJira } from "@/lib/integrations/outbound";
import { getOutboundBinding } from "@/operations/choreography/adapter-bindings";
import {
  backfillJiraRepositoryUrl,
  syncJiraProjectWorkItems,
} from "@/operations/integration/jira-projects";

export async function pushPlanToJiraAction(planId: string) {
  const ctx = await getActionContext();
  const plan = await db.query.planArtifacts.findFirst({
    where: and(eq(planArtifacts.id, planId), eq(planArtifacts.organizationId, ctx.organizationId)),
    columns: { id: true },
  });
  if (!plan) throw new Error("Plan not found.");
  const result = await pushPlanToJira(planId, { throwOnError: true });
  safeRevalidate(`/plans/${planId}`);
  return result;
}

export async function pushApprovedPlansToJiraAction(projectId?: string | null) {
  const ctx = await getActionContext();
  const where = projectId
    ? and(
        eq(planArtifacts.organizationId, ctx.organizationId),
        eq(planArtifacts.projectId, projectId),
        eq(planArtifacts.status, "approved"),
      )
    : and(eq(planArtifacts.organizationId, ctx.organizationId), eq(planArtifacts.status, "approved"));

  const plans = await db.query.planArtifacts.findMany({
    where,
    columns: { id: true, projectId: true, title: true },
  });

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
  const ctx = await getActionContext();
  const where = projectId
    ? and(
        eq(planArtifacts.organizationId, ctx.organizationId),
        eq(planArtifacts.projectId, projectId),
      )
    : eq(planArtifacts.organizationId, ctx.organizationId);

  const plans = await db.query.planArtifacts.findMany({
    where,
    columns: { id: true, projectId: true, title: true, status: true },
  });

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
  const url = await backfillJiraRepositoryUrl({
    organizationId: ctx.organizationId,
    projectId,
    projectKey: binding.externalKey,
  });
  const syncedIssues = await syncJiraProjectWorkItems({
    organizationId: ctx.organizationId,
    projectId,
    projectKey: binding.externalKey,
  });
  safeRevalidate(`/projects/${projectId}/work-items`);
  safeRevalidate(`/projects/${projectId}/settings/repositories`);
  return { projectKey: binding.externalKey, syncedIssues, url };
}
