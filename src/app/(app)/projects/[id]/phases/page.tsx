import { notFound } from "next/navigation";

import { sql } from "drizzle-orm";

import { listGatesForProject } from "@/actions/gate/phase-gates";
import { getProject } from "@/actions/project/projects";
import { db } from "@/db/client";
import { approvals } from "@/db/schema/plan/approval";
import type { PhaseGate } from "@/db/schema/phase-gate";
import { PROJECT_PHASES, type Project, type ProjectPhase } from "@/db/schema/project";
import { PHASE_GUIDANCE } from "@/domain/phases";
import { getActionContext } from "@/lib/auth/context";

import {
  serializeCockpitGate,
  type CockpitGatesByPhase,
} from "../serialize";
import { PhasesTab } from "../tabs/PhasesTab";

export default async function ProjectPhasesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = (await getProject(id)) as Project | null;
  if (!project) notFound();

  const ctx = await getActionContext();
  const allGates = await listGatesForProject(id);

  const pendingByGate = new Map<string, number>();
  if (allGates.length > 0) {
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

  const byPhase = new Map<ProjectPhase, PhaseGate[]>();
  for (const g of allGates) {
    const arr = byPhase.get(g.phase) ?? [];
    arr.push(g);
    byPhase.set(g.phase, arr);
  }
  const gatesByPhase: CockpitGatesByPhase[] = PROJECT_PHASES.map((p) => ({
    phase: p,
    label: PHASE_GUIDANCE[p].label,
    gates: (byPhase.get(p) ?? []).map((g) =>
      serializeCockpitGate(g, pendingByGate.get(g.id) ?? 0),
    ),
  }));

  return (
    <PhasesTab
      project={{ id: project.id, phase: project.phase }}
      gatesByPhase={gatesByPhase}
    />
  );
}
