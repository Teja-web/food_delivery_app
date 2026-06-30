"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import {
  pushApprovedPlansToJiraAction,
  pushAllPlansToJiraAction,
  pushPlanToJiraAction,
} from "@/actions/integration/jira-sync";
import { Button } from "@/components/ui/button";

type PushPlansToJiraButtonProps =
  | {
      mode: "single";
      planId: string;
      disabled?: boolean;
    }
  | {
      mode: "approved";
      projectId?: string | null;
      approvedCount: number;
      disabled?: boolean;
    }
  | {
      mode: "all";
      projectId?: string | null;
      totalCount: number;
      disabled?: boolean;
    };

export function PushPlansToJiraButton(props: PushPlansToJiraButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const disabled =
    props.disabled ||
    pending ||
    (props.mode === "approved" && props.approvedCount === 0) ||
    (props.mode === "all" && props.totalCount === 0);
  const label =
    props.mode === "single"
      ? "Push to Jira"
      : props.mode === "approved"
        ? props.approvedCount === 1
          ? "Push 1 approved plan"
          : `Push ${props.approvedCount} approved plans`
        : props.totalCount === 1
          ? "Push 1 plan"
          : `Push all ${props.totalCount} plans`;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => {
        startTransition(async () => {
          try {
            if (props.mode === "single") {
              const result = await pushPlanToJiraAction(props.planId);
              if (!result) {
                toast.error("No Jira binding configured for this plan.");
                return;
              }
              toast.success(`Pushed to Jira ${result.key}`);
            } else if (props.mode === "approved") {
              const result = await pushApprovedPlansToJiraAction(props.projectId);
              if (result.total === 0) {
                toast.info("No approved plans to push.");
              } else if (result.failed > 0) {
                toast.warning(`Pushed ${result.pushed} of ${result.total} approved plans.`);
              } else {
                toast.success(`Pushed ${result.pushed} approved plans to Jira.`);
              }
            } else {
              const result = await pushAllPlansToJiraAction(props.projectId);
              if (result.total === 0) {
                toast.info("No plans to push.");
              } else if (result.failed > 0) {
                toast.warning(`Pushed ${result.pushed} of ${result.total} plans to Jira.`);
              } else {
                toast.success(`Pushed all ${result.pushed} plans to Jira with status.`);
              }
            }
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Jira push failed");
          }
        });
      }}
    >
      {pending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
      )}
      {label}
    </Button>
  );
}
