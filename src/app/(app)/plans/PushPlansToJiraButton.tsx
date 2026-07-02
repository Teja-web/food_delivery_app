"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import {
  listJiraPushTargetsAction,
  pushPlanToJiraAction,
} from "@/actions/integration/jira-sync";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PushPlansToJiraButtonProps =
  | {
      mode: "single";
      planId: string;
      needsPush?: boolean;
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

type GlobalPushMode = Extract<PushPlansToJiraButtonProps["mode"], "approved" | "all">;

type JiraPushProgress = {
  phase: "preparing" | "pushing";
  completed: number;
  total: number;
  active: number;
  failed: number;
} | null;

const JIRA_GLOBAL_PUSH_CONCURRENCY = 3;

export function PushPlansToJiraButton(props: PushPlansToJiraButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<JiraPushProgress>(null);
  const isGlobalPush = props.mode !== "single";
  const needsPush = props.mode === "single" && props.needsPush === true;
  const disabled =
    props.disabled ||
    pending ||
    progress !== null ||
    (props.mode === "approved" && props.approvedCount === 0) ||
    (props.mode === "all" && props.totalCount === 0);
  const label =
    props.mode === "single"
      ? needsPush
        ? "Push updates to Jira"
        : "Push to Jira"
      : props.mode === "approved"
        ? props.approvedCount === 1
          ? "Push 1 approved plan"
          : `Push ${props.approvedCount} approved plans`
        : props.totalCount === 1
          ? "Push 1 plan"
          : `Push all ${props.totalCount} plans`;
  const progressPercent =
    progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const buttonLabel = progress ? formatProgressLabel(progress) : label;

  async function pushGlobalPlans(
    mode: GlobalPushMode,
    projectId: string | null | undefined,
    expectedTotal: number,
  ) {
    setProgress({
      phase: "preparing",
      completed: 0,
      total: expectedTotal,
      active: 0,
      failed: 0,
    });

    const targets = await listJiraPushTargetsAction({ mode, projectId });
    if (targets.length === 0) {
      toast.info(mode === "approved" ? "No approved plans to push." : "No plans to push.");
      return;
    }

    let pushed = 0;
    let failed = 0;
    let completed = 0;
    let active = 0;
    let nextIndex = 0;

    const updateProgress = () => {
      setProgress({
        phase: "pushing",
        completed,
        total: targets.length,
        active,
        failed,
      });
    };

    const pushNextTarget = async () => {
      for (;;) {
        const target = targets[nextIndex];
        if (!target) return;
        nextIndex += 1;
        active += 1;
        updateProgress();

        try {
          const result = await pushPlanToJiraAction(target.id);
          if (result) {
            pushed += 1;
          } else {
            failed += 1;
          }
        } catch {
          failed += 1;
        } finally {
          active -= 1;
          completed += 1;
          updateProgress();
        }
      }
    };

    updateProgress();
    await Promise.all(
      Array.from(
        { length: Math.min(JIRA_GLOBAL_PUSH_CONCURRENCY, targets.length) },
        () => pushNextTarget(),
      ),
    );

    if (failed > 0) {
      const targetLabel = mode === "approved" ? "approved plans" : "plans";
      toast.warning(`Pushed ${pushed} of ${targets.length} ${targetLabel} to Jira.`);
    } else if (mode === "approved") {
      toast.success(`Pushed ${pushed} approved plans to Jira.`);
    } else {
      toast.success(`Pushed all ${pushed} plans to Jira with status.`);
    }
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant={needsPush ? "default" : "outline"}
      size="sm"
      disabled={disabled}
      title={needsPush ? "This plan has Coznt changes that have not been pushed to Jira." : undefined}
      className={cn(
        isGlobalPush && "relative w-[260px] justify-start overflow-hidden",
        needsPush && "shadow-sm ring-1 ring-primary/35",
      )}
      onClick={() => {
        if (props.mode === "single") {
          startTransition(async () => {
            try {
              const result = await pushPlanToJiraAction(props.planId);
              if (!result) {
                toast.error("No Jira binding configured for this plan.");
                return;
              }
              toast.success(`Pushed to Jira ${result.key}`);
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Jira push failed");
            }
          });
          return;
        }

        const { mode, projectId } = props;
        const expectedTotal = mode === "approved" ? props.approvedCount : props.totalCount;
        void pushGlobalPlans(mode, projectId, expectedTotal)
          .catch((err) => {
            toast.error(err instanceof Error ? err.message : "Jira push failed");
          })
          .finally(() => {
            setProgress(null);
          });
      }}
    >
      <span className="relative z-10 flex min-w-0 items-center gap-1.5">
        {pending || progress ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Send className="h-3.5 w-3.5" aria-hidden />
        )}
        <span className={isGlobalPush ? "min-w-0 truncate" : undefined}>{buttonLabel}</span>
      </span>
      {progress ? (
        <span
          aria-label={`Jira push progress: ${progress.completed} of ${progress.total} complete`}
          aria-valuemax={progress.total}
          aria-valuemin={0}
          aria-valuenow={progress.completed}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-muted"
          role="progressbar"
        >
          <span
            className={`block h-full bg-primary transition-[width] ${
              progress.phase === "preparing" ? "animate-pulse opacity-40" : ""
            }`}
            style={{ width: `${progress.phase === "preparing" ? 100 : progressPercent}%` }}
          />
        </span>
      ) : null}
    </Button>
  );
}

function formatProgressLabel(progress: NonNullable<JiraPushProgress>): string {
  if (progress.phase === "preparing") return "Preparing Jira push...";
  const failedLabel = progress.failed > 0 ? ` - ${progress.failed} failed` : "";
  const activeLabel = progress.active > 0 ? ` - ${progress.active} active` : "";
  return `${progress.completed}/${progress.total} complete${activeLabel}${failedLabel}`;
}
