import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getProject } from "@/actions/project/projects";
import type { Project } from "@/db/schema/project";
import { listProjectArtifacts } from "@/operations/artifacts";
import { getProjectCockpitCounts } from "@/operations/project/cockpit-counts";

import { ProjectShell } from "./ProjectShell";
import { serializeCockpitProject } from "./serialize";

function stageArtifactKind(row: Awaited<ReturnType<typeof listProjectArtifacts>>[number]) {
  const explicit = row.metadata.projectArtifactKind;
  if (explicit === "requirements" || explicit === "design") return explicit;

  const title =
    typeof row.metadata.title === "string" ? row.metadata.title.toLowerCase() : "";
  const name = row.name.toLowerCase();
  if (row.category === "project-exclusive") {
    if (title.includes("requirement") || name.includes("requirement")) return "requirements";
    if (title.includes("design") || name.includes("design")) return "design";
  }
  return null;
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

