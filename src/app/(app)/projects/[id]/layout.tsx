import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getProject } from "@/actions/project/projects";
import type { Project } from "@/db/schema/project";
import { listProjectArtifacts } from "@/operations/artifacts";
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

  const stageArtifacts = artifactRows
    .filter((artifact) => ["requirements.md", "design.md"].includes(artifact.name.toLowerCase()))
    .map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      title:
        typeof artifact.metadata.title === "string" && artifact.metadata.title.trim()
          ? artifact.metadata.title
          : artifact.name,
      body: artifact.body,
      type: artifact.type,
    }));

  return (
    <ProjectShell project={serializeCockpitProject(project)} counts={counts} stageArtifacts={stageArtifacts}>
      {children}
    </ProjectShell>
  );
}

