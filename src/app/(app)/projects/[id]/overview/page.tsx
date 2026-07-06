import { and, eq, gte } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getProject } from "@/actions/project/projects";
import { Toaster } from "@/components/ui/sonner";
import { db } from "@/db/client";
import { governanceRecords } from "@/db/schema/governance/records";
import { projectTasks } from "@/db/schema/plan/project-task";
import type { Project } from "@/db/schema/project";
import { skillOutcomes } from "@/db/schema/skill/skill-outcome";
import { getActionContext } from "@/lib/auth/context";
import { listBindingsForProject } from "@/operations/choreography/adapter-bindings";
import { getStaleEvidence } from "@/operations/evidence";

import { serializeCockpitBinding } from "../serialize";
import { OverviewTab, type PendingGovernanceRow, type ProjectPulse } from "../tabs/OverviewTab";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = (await getProject(id)) as Project | null;
  if (!project) notFound();

  const ctx = await getActionContext();
  const now = Date.now();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [allPlans, pendingRows, outcomes30dRows, incidents7dRows, bindings, staleEvidence] = await Promise.all([
    db
      .select({
        id: projectTasks.id,
        title: projectTasks.title,
        status: projectTasks.status,
      })
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.organizationId, ctx.organizationId),
          eq(projectTasks.projectId, id),
        ),
      ),
    db
      .select({
        id: governanceRecords.id,
        kind: governanceRecords.kind,
        projectTaskId: governanceRecords.projectTaskId,
        createdAt: governanceRecords.createdAt,
      })
      .from(governanceRecords)
      .where(
        and(
          eq(governanceRecords.organizationId, ctx.organizationId),
          eq(governanceRecords.projectId, id),
          eq(governanceRecords.status, "pending"),
        ),
      ),
    db
      .select({ id: skillOutcomes.id })
      .from(skillOutcomes)
      .where(
        and(
          eq(skillOutcomes.organizationId, ctx.organizationId),
          eq(skillOutcomes.projectId, id),
          gte(skillOutcomes.recordedAt, since30d),
        ),
      ),
    db
      .select({ id: skillOutcomes.id })
      .from(skillOutcomes)
      .where(
        and(
          eq(skillOutcomes.organizationId, ctx.organizationId),
          eq(skillOutcomes.projectId, id),
          eq(skillOutcomes.verdict, "incident"),
          gte(skillOutcomes.recordedAt, since7d),
        ),
      ),
    listBindingsForProject(id),
    getStaleEvidence({ projectId: id, windowDays: 30 }),
  ]);

  const plansTotal = allPlans.length;
  const plansInReview = allPlans.filter((p) => p.status === "in_review").length;
  const plansInProgress = allPlans.filter((p) => p.status === "in_progress").length;
  const planTitleById = new Map(allPlans.map((p) => [p.id, p.title]));

  const pulse: ProjectPulse = {
    plansTotal,
    plansInReview,
    plansInProgress,
    governancePending: pendingRows.length,
    outcomes30d: outcomes30dRows.length,
    incidents7d: incidents7dRows.length,
    verificationDebt: staleEvidence.length,
  };

  const pendingGovernance: PendingGovernanceRow[] = pendingRows
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      projectTaskId: r.projectTaskId,
      planTitle: planTitleById.get(r.projectTaskId) ?? null,
      createdAtIso: r.createdAt.toISOString(),
    }));

  return (
    <>
      <OverviewTab
        projectId={project.id}
        projectName={project.name}
        pulse={pulse}
        pendingGovernance={pendingGovernance}
        bindings={bindings.map(serializeCockpitBinding)}
      />
      <Toaster />
    </>
  );
}
