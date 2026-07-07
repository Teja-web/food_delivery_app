import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getProject } from "@/actions/project/projects";
import type { Project } from "@/db/schema/project";
import { listProjectArtifacts, resolveProjectArtifactKind } from "@/operations/artifacts";
import { getProjectCockpitCounts } from "@/operations/project/cockpit-counts";

import { ProjectShell } from "./ProjectShell";
import { serializeCockpitProject } from "./serialize";

export default async function ProjectLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { id } = await params;
  const project = (await getProject(id)) as Project | null;
  if (!project) notFound();

  const [counts, artifactRows] = await Promise.all([
    getProjectCockpitCounts(id),
    listProjectArtifacts(id),
  ]);

  const stageArtifacts = artifactRows.flatMap((artifact) => {
    const kind = resolveProjectArtifactKind(artifact);
    if (kind !== "requirements" && kind !== "design") return [];
    return [
      {
        id: artifact.id,
        name: kind === "requirements" ? "requirements.md" : "design.md",
        sourceFileName: artifact.name,
        title:
          kind === "requirements" ? "Project Requirements" : "Project Design",
        body: artifact.body,
        type: artifact.type,
      },
    ];
  });

  return (
    <ProjectShell project={serializeCockpitProject(project)} counts={counts} stageArtifacts={stageArtifacts}>
      {children}
    </ProjectShell>
  );
}

