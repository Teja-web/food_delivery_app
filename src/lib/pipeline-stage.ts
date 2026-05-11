/**
 * Stage transition logic for applications.
 *
 * Hoists the "what should the user do next?" decision out of
 * PipelineMatchCard so it can be shared by:
 *   - the right-pane sticky action bar (Phase 2)
 *   - server-side validators on bulk operations
 *   - any future surface that needs to know an app's next step
 *
 * Decision-readiness is intentionally NOT here — that logic reads the
 * `applicationIntelligence` table (async, DB-driven) and lives in
 * `automations/tasks/pipeline.ts`. The serialize layer surfaces the
 * pre-computed `decisionReadiness.isReady` flag for clients.
 */

/** Minimum local types — kept here so this module is a leaf with no app/ deps. */
export interface PipelineStageInfo {
  id: string;
  name: string;
  type: "system" | "interview";
}

export interface InterviewProgressStep {
  stageId: string;
  stageName: string;
  status: "completed" | "proposed" | "pending";
  interviewId: string | null;
}

export interface StageContext {
  stage: string;
  offerId?: string | null;
  interviewProgress?: InterviewProgressStep[];
}

/** A candidate is "stale" if no activity for this many days. */
export const STALE_THRESHOLD_DAYS = 7;

export const TERMINAL_STAGES = ["rejected", "withdrawn", "hired"] as const;
export type TerminalStage = (typeof TERMINAL_STAGES)[number];

export function isTerminalStage(stage: string): stage is TerminalStage {
  return (TERMINAL_STAGES as readonly string[]).includes(stage);
}

/**
 * Discriminated union for the next action a recruiter can take on an application.
 * The `kind` field selects which handler the UI invokes.
 */
export type NextStageResult =
  | { kind: "restore"; toStage: string; label: "Restore" }
  | { kind: "view-offer"; offerId: string | null; label: "View Offer" }
  | { kind: "advance-to-offer"; label: "Advance to Offer" }
  | { kind: "view-interview"; interviewId: string; stageName: string; label: "View Interview" }
  | { kind: "schedule"; stageId: string; stageName: string; label: string }
  | { kind: "advance"; toStage: string; toStageName: string; label: string }
  | { kind: "none" };

/**
 * Compute the next stage transition for an application given the role's pipeline.
 *
 * Behavior preserves the existing PipelineMatchCard logic, with one fix:
 * `hired` is now explicitly terminal (was falling through to the default
 * branch which incorrectly suggested advancing).
 */
export function nextStage(
  app: StageContext,
  pipeline: PipelineStageInfo[],
): NextStageResult {
  if (app.stage === "hired") {
    return { kind: "none" };
  }

  if (app.stage === "rejected" || app.stage === "withdrawn") {
    const firstStage = pipeline[0]?.id ?? "sourced";
    return { kind: "restore", toStage: firstStage, label: "Restore" };
  }

  if (app.stage === "offer") {
    return {
      kind: "view-offer",
      offerId: app.offerId ?? null,
      label: "View Offer",
    };
  }

  const progress = app.interviewProgress ?? [];

  if (app.stage === "interview" && progress.length > 0) {
    const allComplete = progress.every((p) => p.status === "completed");
    if (allComplete) {
      return { kind: "advance-to-offer", label: "Advance to Offer" };
    }

    const currentStep = progress.find((p) => p.status !== "completed");
    if (currentStep?.status === "proposed" && currentStep.interviewId) {
      return {
        kind: "view-interview",
        interviewId: currentStep.interviewId,
        stageName: currentStep.stageName,
        label: "View Interview",
      };
    }
    if (currentStep?.status === "pending") {
      return {
        kind: "schedule",
        stageId: currentStep.stageId,
        stageName: currentStep.stageName,
        label: `Schedule ${currentStep.stageName}`,
      };
    }
    return { kind: "none" };
  }

  // Default: derive from the role's pipeline ordering.
  const currentIdx = pipeline.findIndex((s) => s.id === app.stage);
  const nextPipelineStage =
    currentIdx >= 0 && currentIdx < pipeline.length - 1
      ? pipeline[currentIdx + 1]
      : null;

  if (!nextPipelineStage) return { kind: "none" };

  if (nextPipelineStage.type === "interview") {
    return {
      kind: "schedule",
      stageId: nextPipelineStage.id,
      stageName: nextPipelineStage.name,
      label: `Schedule ${nextPipelineStage.name}`,
    };
  }

  return {
    kind: "advance",
    toStage: nextPipelineStage.id,
    toStageName: nextPipelineStage.name,
    label: `Advance to ${nextPipelineStage.name}`,
  };
}
