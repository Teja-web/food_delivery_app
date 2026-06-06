import { notFound } from "next/navigation";

import { getProject } from "@/actions/project/projects";
import type { Project } from "@/db/schema/project";

import { DangerActions } from "./DangerActions";

export default async function DangerZoneSettings({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = (await getProject(id)) as Project | null;
  if (!project) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-base font-semibold text-red-500">Danger zone</h2>
        <p className="text-xs text-muted-foreground">
          Archive is reversible. Delete is permanent.
        </p>
      </header>

      <section className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
        <p className="text-sm font-medium">Archive project</p>
        <p className="text-xs text-muted-foreground">
          Read-only. No new artifacts, no gate changes. Audit log preserved.
        </p>
        <DangerActions
          projectId={id}
          projectName={project.name}
          currentStatus={project.status}
        />
      </section>
    </div>
  );
}
