import { notFound } from "next/navigation";

import { getProject } from "@/actions/project/projects";
import type { Project } from "@/db/schema/project";
import { getActiveProjectKey } from "@/operations/integration/api-keys";

import { serializeCockpitProject } from "../../serialize";
import { SettingsTab } from "../../tabs/SettingsTab";
import { ConnectAgentSection } from "./ConnectAgentSection";

export default async function GeneralPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = (await getProject(id)) as Project | null;
  if (!project) notFound();

  const projectKey = await getActiveProjectKey(id);

  return (
    <div className="space-y-10">
      <SettingsTab project={serializeCockpitProject(project)} />
      <ConnectAgentSection
        projectId={id}
        projectSlug={project.slug}
        apiKeyPrefix={projectKey?.prefix ?? null}
      />
    </div>
  );
}
