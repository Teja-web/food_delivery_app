import { listOrgIntegrationCredentials } from "@/operations/integration/integrations";
import { projectCrud } from "@/operations/project/projects";
import { listRepositoriesForProject } from "@/operations/project/repositories";
import { Toaster } from "@/components/ui/sonner";
import type { RepositorySource } from "@/db/schema/repository";

import { RepositoriesClient } from "./RepositoriesClient";

export default async function RepositoriesSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, repos, creds] = await Promise.all([
    projectCrud.get(id),
    listRepositoriesForProject(id),
    listOrgIntegrationCredentials(),
  ]);

  return (
    <>
      <RepositoriesClient
        projectId={id}
        projectName={project?.name ?? "this project"}
        repos={repos.map((r) => ({
          id: r.id,
          source: r.source,
          identifier: r.identifier,
          url: r.url ?? null,
          defaultBranch: r.defaultBranch ?? null,
        }))}
        connectedProviders={creds.map((c) => c.provider as RepositorySource)}
      />
      <Toaster />
    </>
  );
}
