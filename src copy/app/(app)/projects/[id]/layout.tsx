import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getProject } from "@/actions/project/projects";
import type { Project } from "@/db/schema/project";
import { resolveProjectArtifactKind } from "@/lib/artifacts/project-artifact-templates";
import { listProjectArtifacts } from "@/operations/artifacts";
import { getProjectCockpitCounts } from "@/operations/project/cockpit-counts";

import { ProjectShell } from "./ProjectShell";
import { serializeCockpitProject } from "./serialize";

function stageArtifactKind(row: Awaited<ReturnType<typeof listProjectArtifacts>>[number]) {
  const kind = resolveProjectArtifactKind(row);
  return kind === "requirements" || kind === "design" ? kind : null;
}

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
    const kind = stageArtifactKind(artifact);
    if (!kind) return [];
    return [
      {
        id: artifact.id,
        name: artifact.name,
        sourceFileName: artifact.name,
        title:
          typeof artifact.metadata.title === "string" && artifact.metadata.title.trim()
            ? artifact.metadata.title
            : kind === "requirements"
              ? "Project Requirements"
              : "Project Design",
        body: artifact.body,
        type: artifact.type,
        projectArtifactKind: kind,
      },
    ];
  });

  return (
    <ProjectShell project={serializeCockpitProject(project)} counts={counts} stageArtifacts={stageArtifacts}>
      {children}
    </ProjectShell>
  );
}

