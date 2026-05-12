import { notFound } from "next/navigation";

import { listGatesForPhase } from "@/actions/phase-gates";
import { getProject } from "@/actions/projects";
import type { Project } from "@/db/schema/project";
import { canAdvanceFrom, nextPhase, PHASE_GUIDANCE } from "@/domain/phases";
import { listBindingsForProject } from "@/operations/adapter-bindings";
import { getOrCreateProjectKey } from "@/operations/api-keys";
import { listPlansByProject } from "@/operations/plans";

import { CockpitClient } from "./CockpitClient";
import {
  serializeCockpitBinding,
  serializeCockpitGate,
  serializeCockpitPlan,
  serializeCockpitProject,
  type CockpitClient as CockpitData,
} from "./serialize";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = (await getProject(id)) as Project | null;
  if (!project) notFound();

  const [plans, gates, bindings, apiKey] = await Promise.all([
    listPlansByProject(id, { limit: 50 }),
    listGatesForPhase(id, project.phase),
    listBindingsForProject(id),
    getOrCreateProjectKey(id),
  ]);

  const gatesAllPassed = gates.every((g) => g.status === "passed" || g.status === "skipped");
  const next = nextPhase(project.phase);
  const canAdvance = canAdvanceFrom(project.phase) && gatesAllPassed;
  const blockedReason = !gatesAllPassed
    ? `${gates.filter((g) => g.status !== "passed" && g.status !== "skipped").length} gate(s) not yet cleared`
    : null;

  const data: CockpitData = {
    project: serializeCockpitProject(project),
    nextPhase: next,
    canAdvance,
    blockedReason,
    guidance: PHASE_GUIDANCE[project.phase],
    gates: gates.map(serializeCockpitGate),
    gatesAllPassed,
    bindings: bindings.map(serializeCockpitBinding),
    plans: plans.map(serializeCockpitPlan),
    apiKey,
  };

  return <CockpitClient data={data} />;
}
