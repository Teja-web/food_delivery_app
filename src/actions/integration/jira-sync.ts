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
