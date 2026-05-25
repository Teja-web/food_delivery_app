import { notFound } from "next/navigation";

import { listGatesForPhase, listGatesForProject } from "@/actions/phase-gates";
import { getProject } from "@/actions/projects";
import type { PhaseGate } from "@/db/schema/phase-gate";
import { PROJECT_PHASES, type Project, type ProjectPhase } from "@/db/schema/project";
import { canAdvanceFrom, nextPhase, PHASE_GUIDANCE } from "@/domain/phases";
import { listBindingsForProject } from "@/operations/adapter-bindings";
import { getOrCreateProjectKey } from "@/operations/api-keys";
import { listDeployments } from "@/operations/deployments";
import { listPlansByProject } from "@/operations/plans";
import { listProjectLearnings } from "@/operations/project-learnings";
import {
  getProjectAutonomyPolicyMatrix,
  getRecentProjectOutcomes,
} from "@/operations/project-trust";
import { listRulesForProject } from "@/operations/rules";
import { listSkillsForProject } from "@/operations/skills";
import { listWorkItemsForProject } from "@/operations/work-items";
import { getActionContext } from "@/lib/auth/context";
import {
  attenuationFactorForProject,
  listRecentPromptsForProject,
} from "@/operations/prompt-log";
import { isPromptGovernanceEnabled } from "@/lib/prompt-quality/feature-flag";

import { CockpitClient } from "./CockpitClient";
import {
  serializeCockpitBinding,
  serializeCockpitDeployment,
  serializeCockpitGate,
  serializeCockpitPlan,
  serializeCockpitProject,
  serializeCockpitRule,
  serializeCockpitSkill,
  serializeCockpitWorkItem,
  type CockpitClient as CockpitData,
  type CockpitGatesByPhase,
} from "./serialize";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = (await getProject(id)) as Project | null;
  if (!project) notFound();

  const ctx = await getActionContext();
  const [
    plans,
    currentPhaseGates,
    allGates,
    bindings,
    rules,
    skills,
    workItems,
    deployments,
    apiKey,
    trustOutcomes,
    trustPolicy,
    trustLearnings,
  ] = await Promise.all([
    listPlansByProject(id, { limit: 100 }),
    listGatesForPhase(id, project.phase),
    listGatesForProject(id),
    listBindingsForProject(id),
    listRulesForProject(id, project.phase),
    listSkillsForProject(id),
    listWorkItemsForProject(id, { limit: 200 }),
    listDeployments({ projectId: id, limit: 50 }),
    getOrCreateProjectKey(id),
    getRecentProjectOutcomes(id, 30),
    getProjectAutonomyPolicyMatrix(ctx.organizationId, id),
    listProjectLearnings(id, { limit: 20 }),
  ]);

  // Prompt-quality surface (feature-flagged). When disabled, ship an empty
  // shape so the Trust tab doesn't render a setup callout in deployments
  // that haven't opted in.
  const promptGovEnabled = isPromptGovernanceEnabled();
  const [promptAttenuation, recentPrompts] = promptGovEnabled
    ? await Promise.all([
        attenuationFactorForProject(ctx.organizationId, id),
        listRecentPromptsForProject(ctx.organizationId, id, { limit: 25 }),
      ])
    : [null, [] as Awaited<ReturnType<typeof listRecentPromptsForProject>>];

  const gatesAllPassed = currentPhaseGates.every(
    (g) => g.status === "passed" || g.status === "skipped",
  );
  const next = nextPhase(project.phase);
  const canAdvance = canAdvanceFrom(project.phase) && gatesAllPassed;
  const blockedReason = !gatesAllPassed
    ? `${currentPhaseGates.filter((g) => g.status !== "passed" && g.status !== "skipped").length} gate(s) not yet cleared`
    : null;

  // Group all gates by phase so the Phases tab can render a timeline.
  const byPhase = new Map<ProjectPhase, PhaseGate[]>();
  for (const g of allGates) {
    const arr = byPhase.get(g.phase) ?? [];
    arr.push(g);
    byPhase.set(g.phase, arr);
  }
  const gatesByPhase: CockpitGatesByPhase[] = PROJECT_PHASES.map((p) => ({
    phase: p,
    label: PHASE_GUIDANCE[p].label,
    gates: (byPhase.get(p) ?? []).map(serializeCockpitGate),
  }));

  const data: CockpitData = {
    project: serializeCockpitProject(project),
    nextPhase: next,
    canAdvance,
    blockedReason,
    guidance: PHASE_GUIDANCE[project.phase],
    gates: currentPhaseGates.map(serializeCockpitGate),
    gatesAllPassed,
    gatesByPhase,
    bindings: bindings.map(serializeCockpitBinding),
    plans: plans.map(serializeCockpitPlan),
    workItems: workItems.map(serializeCockpitWorkItem),
    deployments: deployments.map(serializeCockpitDeployment),
    rules: rules.map((r) => serializeCockpitRule(r, id)),
    skills: skills.map((s) => serializeCockpitSkill(s, id)),
    apiKey,
    trust: {
      outcomes: trustOutcomes,
      policy: trustPolicy,
      learnings: trustLearnings,
      promptGovernanceEnabled: promptGovEnabled,
      promptQuality: promptGovEnabled
        ? {
            attenuationFactor: promptAttenuation?.factor ?? 1.0,
            distribution: promptAttenuation?.distribution ?? {
              good: 0,
              needsImprovement: 0,
              poor: 0,
              total: 0,
            },
            recent: recentPrompts.map((p) => ({
              id: p.id,
              role: p.role,
              source: p.source,
              content: p.content,
              promptScore: p.promptScore,
              promptTier: p.promptTier,
              authorName: p.authorName,
              createdAt: p.createdAt.toISOString(),
            })),
          }
        : null,
    },
  };

  return <CockpitClient data={data} />;
}
