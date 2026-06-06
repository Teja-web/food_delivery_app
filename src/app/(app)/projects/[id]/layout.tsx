import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getProject } from "@/actions/project/projects";
import type { Project } from "@/db/schema/project";
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

  const counts = await getProjectCockpitCounts(id);

  return (
    <ProjectShell project={serializeCockpitProject(project)} counts={counts}>
      {children}
    </ProjectShell>
  );
}
