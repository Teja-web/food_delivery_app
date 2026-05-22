import type { Project } from "@/db/schema/project";
import { listApiKeysAction } from "@/actions/api-keys";
import { listProjects } from "@/actions/projects";
import { ApiKeysClient } from "./ApiKeysClient";
import { serializeApiKey, type ProjectOption } from "./serialize";

export default async function ApiKeysPage() {
  const [keys, projectsList] = await Promise.all([
    listApiKeysAction(),
    listProjects({ limit: 200 }),
  ]);
  const projects: ProjectOption[] = projectsList.items.map((p: Project) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
  }));
  const projectsById = new Map(projects.map((p) => [p.id, p] as const));
  const rows = keys.map((k) => serializeApiKey(k, projectsById));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">API keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bearer tokens for the <code>/api/v1</code> agent surface. Every key is bound to one project — the
          IDE session auto-binds from the key at handshake. The plaintext is shown once on creation.
        </p>
      </div>
      <ApiKeysClient initialKeys={rows} projects={projects} />
    </div>
  );
}
