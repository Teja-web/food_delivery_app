"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setRequireHumanApprovalForMerge } from "@/actions/project/projects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Props {
  projectId: string;
  enabled: boolean;
}

export function MergeApprovalPolicyCard({ projectId, enabled: initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function onToggle(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    startTransition(async () => {
      try {
        await setRequireHumanApprovalForMerge(projectId, next);
        toast.success(
          next
            ? "Merge approval required — PRs will block until decided"
            : "Merge approval relaxed — autonomy thresholds apply",
        );
      } catch (err) {
        setEnabled(previous);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Merge approval policy
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Label
              htmlFor="merge-approval-switch"
              className="cursor-pointer text-sm font-medium"
            >
              Require human approval for PR merge
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              When on, the execution gate fails any PR without a decided
              approval row — autonomy thresholds cannot stand in for a
              reviewer. Use on production or regulated projects. Requires
              admin or owner role to change.
            </p>
          </div>
          <Switch
            id="merge-approval-switch"
            checked={enabled}
            disabled={pending}
            onCheckedChange={onToggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}
