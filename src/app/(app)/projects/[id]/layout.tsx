import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getProject } from "@/actions/project/projects";
import type { Project } from "@/db/schema/project";
import { getOrCreateProjectKey } from "@/operations/integration/api-keys";
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

  const [apiKey, counts] = await Promise.all([
    getOrCreateProjectKey(id),
    getProjectCockpitCounts(id),
  ]);

  return (
    <ProjectShell
      project={serializeCockpitProject(project)}
      apiKey={apiKey}
      counts={counts}
    >
      {children}
    </ProjectShell>
  );
}
