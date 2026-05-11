import type { ReactNode } from "react";

export interface TourStepContext {
  isEmpty: boolean;
}

export interface TourStep {
  icon?: ReactNode | string | null;
  title: string;
  content: ReactNode | ((context: TourStepContext) => ReactNode);
  selector?: string;
  side?: "top" | "bottom" | "left" | "right";
  showControls?: boolean;
  showSkip?: boolean;
  blockKeyboardControl?: boolean;
  pointerPadding?: number;
  pointerRadius?: number;
  disableInteraction?: boolean;
  nextRoute?: string;
  prevRoute?: string;
  viewportID?: string;
}

export interface TourTrigger {
  event: string;
  condition: "first-for-user";
}

export interface TourDefinition {
  tour: string;
  type: "orientation" | "workflow";
  trigger?: TourTrigger;
  steps: TourStep[];
}

export interface TourProgressRecord {
  id: string;
  userId: string;
  organizationId: string;
  tourId: string;
  status: "pending" | "completed" | "skipped";
  currentStep: number | null;
  completedAt: Date | null;
  createdAt: Date;
}
