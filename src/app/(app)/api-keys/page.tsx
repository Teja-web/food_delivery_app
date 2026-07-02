import type { Project } from "@/db/schema/project";
import { listApiKeysWithContextAction } from "@/actions/integration/api-keys";
import { listProjects } from "@/actions/project/projects";
import { getCurrentUser } from "@/lib/auth/actions";

import { ApiKeysAuditClient } from "./ApiKeysAuditClient";
import {
  computeKpis,
  groupByProject,
  serializeApiKey,
  type ProjectOption,
} from "./serialize";

export default async function ApiKeysPage() {
  const [keys, projectsList, currentUser] = await Promise.all([
    listApiKeysWithContextAction(),
    listProjects({ limit: 500 }),
    getCurrentUser(),
  ]);
  const rows = keys.map(serializeApiKey);
  const kpis = computeKpis(rows);
  const groups = groupByProject(rows);
  const projects: ProjectOption[] = projectsList.items.map((p: Project) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">API keys</h1>
        <p className="text-sm text-muted-foreground">
          Org-wide audit of bearer tokens for the <code>/api/v1</code> agent surface. Every key
          is bound to a single project. Primary key management lives in each project&apos;s
          settings tab; this view is for audit and admin-side rotation.
        </p>
      </header>

      <ApiKeysAuditClient
        kpis={kpis}
        groups={groups}
        rows={rows}
        projects={projects}
        canCreateApiKeys={currentUser.role === "owner"}
      />
    </div>
  );
}
