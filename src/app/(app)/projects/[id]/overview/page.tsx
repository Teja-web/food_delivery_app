import { notFound } from "next/navigation";

import { sql } from "drizzle-orm";

import { listGatesForPhase } from "@/actions/gate/phase-gates";
import { getProject } from "@/actions/project/projects";
import { db } from "@/db/client";
import { approvals } from "@/db/schema/plan/approval";
import type { Project } from "@/db/schema/project";
import { canAdvanceFrom, nextPhase, PHASE_GUIDANCE } from "@/domain/phases";
import { getActionContext } from "@/lib/auth/context";
import { listBindingsForProject } from "@/operations/choreography/adapter-bindings";

import {
  serializeCockpitBinding,
  serializeCockpitGate,
  serializeCockpitProject,
} from "../serialize";
import { OverviewTab } from "../tabs/OverviewTab";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = (await getProject(id)) as Project | null;
  if (!project) notFound();

  const ctx = await getActionContext();
  const [currentPhaseGates, bindings] = await Promise.all([
    listGatesForPhase(id, project.phase),
    listBindingsForProject(id),
  ]);

  const pendingByGate = new Map<string, number>();
  if (currentPhaseGates.length > 0) {
    const rows = await db
      .select({
        gateId: approvals.entityId,
        count: sql<number>`count(*)::int`,
      })
      .from(approvals)
      .where(
        sql`${approvals.organizationId} = ${ctx.organizationId}
          AND ${approvals.entityType} = 'phase_gate'
          AND ${approvals.status} = 'pending'`,
      )
      .groupBy(approvals.entityId);
    for (const r of rows) pendingByGate.set(r.gateId, r.count);
  }

  const gatesAllPassed = currentPhaseGates.every(
    (g) => g.status === "passed" || g.status === "skipped",
  );
  const next = nextPhase(project.phase);
  const canAdvance = canAdvanceFrom(project.phase) && gatesAllPassed;
  const blockedReason = !gatesAllPassed
    ? `${currentPhaseGates.filter((g) => g.status !== "passed" && g.status !== "skipped").length} gate(s) not yet cleared`
    : null;

  const serialized = serializeCockpitProject(project);

  return (
    <OverviewTab
      project={{ slug: serialized.slug, createdAt: serialized.createdAt }}
      guidance={PHASE_GUIDANCE[project.phase]}
      gates={currentPhaseGates.map((g) =>
        serializeCockpitGate(g, pendingByGate.get(g.id) ?? 0),
      )}
      gatesAllPassed={gatesAllPassed}
      nextPhase={next}
      canAdvance={canAdvance}
      blockedReason={blockedReason}
      bindings={bindings.map(serializeCockpitBinding)}
    />
  );
}
