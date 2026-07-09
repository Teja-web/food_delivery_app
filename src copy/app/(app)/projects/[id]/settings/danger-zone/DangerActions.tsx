"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { archiveProject, restoreProject } from "@/actions/project/danger";

interface Props {
  projectId: string;
  projectName: string;
  currentStatus: string;
}

export function DangerActions({ projectId, projectName, currentStatus }: Props) {
  const [pending, startTransition] = useTransition();
  const archived = currentStatus === "archived";

  const onArchive = () => {
    if (!confirm(`Archive "${projectName}"? You can restore it later.`)) return;
    startTransition(async () => {
      try {
        await archiveProject(projectId);
        toast.success("Project archived");
      } catch (e) {
        toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    });
  };

  const onRestore = () => {
    startTransition(async () => {
      try {
        await restoreProject(projectId);
        toast.success("Project restored");
      } catch (e) {
        toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {archived ? (
        <Button onClick={onRestore} disabled={pending} variant="outline">
          Restore project
        </Button>
      ) : (
        <Button onClick={onArchive} disabled={pending} variant="outline">
          Archive project
        </Button>
      )}
    </div>
  );
}
