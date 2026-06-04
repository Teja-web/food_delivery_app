import { notFound } from "next/navigation";

import { getProject } from "@/actions/project/projects";
import type { Project } from "@/db/schema/project";
import { isPromptGovernanceEnabled } from "@/domain/prompt-quality/feature-flag";
import { getActionContext } from "@/lib/auth/context";
import { listProjectLearnings } from "@/operations/plan/project-learnings";
import {
  getProjectAutonomyPolicyMatrix,
  getRecentProjectOutcomes,
} from "@/operations/project/project-trust";
import {
  attenuationFactorForProject,
  listRecentPromptsForProject,
} from "@/operations/prompt/prompt-log";

import { TrustTab } from "../tabs/TrustTab";

export default async function ProjectTrustPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = (await getProject(id)) as Project | null;
  if (!project) notFound();

  const ctx = await getActionContext();
  const [outcomes, policy, learnings] = await Promise.all([
    getRecentProjectOutcomes(id, 30),
    getProjectAutonomyPolicyMatrix(ctx.organizationId, id),
    listProjectLearnings(id, { limit: 20 }),
  ]);

  const promptGovEnabled = isPromptGovernanceEnabled();
  const [promptAttenuation, recentPrompts] = promptGovEnabled
    ? await Promise.all([
        attenuationFactorForProject(ctx.organizationId, id),
        listRecentPromptsForProject(ctx.organizationId, id, { limit: 25 }),
      ])
    : [null, [] as Awaited<ReturnType<typeof listRecentPromptsForProject>>];

  const promptQuality = promptGovEnabled
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
    : null;

  return (
    <TrustTab
      projectId={id}
      outcomes={outcomes}
      policy={policy}
      learnings={learnings}
      promptQuality={promptQuality}
      promptGovernanceEnabled={promptGovEnabled}
      requireHumanApprovalForMerge={project.requireHumanApprovalForMerge}
    />
  );
}
