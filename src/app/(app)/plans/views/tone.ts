import type { PlanKind, PlanStatus } from "@/db/schema/plan/project-task";

import type { PlanRowClient } from "../serialize";

export const STATUS_TONE_CLASS: Record<PlanRowClient["statusTone"], string> = {
  neutral: "border-foreground/20 bg-foreground/5 text-foreground/85",
  info: "border-autonomy-propose/40 bg-autonomy-propose/10 text-autonomy-propose",
  success: "border-trend-up/40 bg-trend-up/10 text-trend-up",
  danger: "border-state-failed/40 bg-state-failed/10 text-state-failed",
  muted: "border-border/60 bg-muted/40 text-muted-foreground",
};

export const KIND_TONE_CLASS: Record<PlanKind, string> = {
  epic: "border-autonomy-lead/40 text-autonomy-lead",
  feature: "border-autonomy-merge/40 text-autonomy-merge",
  story: "border-autonomy-propose/40 text-autonomy-propose",
  spec: "border-autonomy-propose/40 text-autonomy-propose",
  adr: "border-foreground/30 text-foreground/85",
  test_plan: "border-state-pending/40 text-state-pending",
  release_plan: "border-trend-up/40 text-trend-up",
  risk_register: "border-state-failed/40 text-state-failed",
  incident: "border-state-failed/40 text-state-failed",
};

export const STATUS_FILTER_TONE: Record<PlanStatus, string> = {
  draft: "border-border/60 bg-muted/40 text-muted-foreground",
  in_review: "border-autonomy-propose/50 bg-autonomy-propose/15 text-autonomy-propose",
  approved: "border-trend-up/50 bg-trend-up/15 text-trend-up",
  in_progress: "border-foreground/40 bg-foreground/10 text-foreground",
  completed: "border-trend-up/50 bg-trend-up/15 text-trend-up",
  rejected: "border-state-failed/50 bg-state-failed/15 text-state-failed",
  changes_requested: "border-autonomy-propose/50 bg-autonomy-propose/15 text-autonomy-propose",
  cancelled: "border-border/60 bg-muted/40 text-muted-foreground",
};

export const KIND_DOT_CLASS: Record<PlanKind, string> = {
  epic: "bg-autonomy-lead",
  feature: "bg-autonomy-merge",
  story: "bg-autonomy-propose",
  spec: "bg-autonomy-propose",
  adr: "bg-foreground/60",
  test_plan: "bg-state-pending",
  release_plan: "bg-trend-up",
  risk_register: "bg-state-failed",
  incident: "bg-state-failed",
};
