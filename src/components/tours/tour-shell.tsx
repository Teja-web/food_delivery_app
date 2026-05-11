"use client";

import { useEffect, useCallback, useMemo } from "react";
import { NextStep, NextStepProvider, useNextStep } from "nextstepjs";
import type { Tour } from "nextstepjs";
import { TourCard } from "./tour-card";
import type { TourDefinition, TourProgressRecord } from "./types";

export interface TourShellProps {
  children: React.ReactNode;
  tours: TourDefinition[];
  getPendingTours?: () => Promise<TourProgressRecord[]>;
  onTourComplete?: (tourId: string) => Promise<void> | void;
  onTourSkip?: (tourId: string, step: number) => Promise<void> | void;
  onStepChange?: (tourId: string, step: number) => Promise<void> | void;
}

function resolveStepContent(
  content: TourDefinition["steps"][number]["content"],
): React.ReactNode {
  if (typeof content === "function") {
    return content({ isEmpty: false });
  }
  return content;
}

function toNextStepTours(tours: TourDefinition[]): Tour[] {
  return tours.map((t) => ({
    tour: t.tour,
    steps: t.steps.map((s) => ({
      icon: s.icon ?? null,
      title: s.title,
      content: resolveStepContent(s.content),
      selector: s.selector,
      side: s.side,
      showControls: s.showControls,
      showSkip: s.showSkip,
      blockKeyboardControl: s.blockKeyboardControl,
      pointerPadding: s.pointerPadding,
      pointerRadius: s.pointerRadius,
      disableInteraction: s.disableInteraction,
      nextRoute: s.nextRoute,
      prevRoute: s.prevRoute,
      viewportID: s.viewportID,
    })),
  }));
}

function TourLauncher({
  tours,
  getPendingTours,
}: Pick<TourShellProps, "tours" | "getPendingTours">) {
  const { startNextStep } = useNextStep();

  useEffect(() => {
    if (!getPendingTours) return;

    let cancelled = false;
    getPendingTours().then((pending) => {
      if (cancelled || pending.length === 0) return;

      const orientation = pending.find((p) => {
        const def = tours.find((t) => t.tour === p.tourId);
        return def?.type === "orientation";
      });
      const target = orientation || pending[0];

      if (target) {
        const def = tours.find((t) => t.tour === target.tourId);
        const delay = def?.type === "workflow" ? 500 : 0;
        setTimeout(() => {
          if (!cancelled) {
            startNextStep(target.tourId);
          }
        }, delay);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [getPendingTours, tours, startNextStep]);

  return null;
}

export function TourShell({
  children,
  tours,
  getPendingTours,
  onTourComplete,
  onTourSkip,
  onStepChange,
}: TourShellProps) {
  const nextStepTours = useMemo(() => toNextStepTours(tours), [tours]);

  const handleComplete = useCallback(
    (tourName: string | null) => {
      if (tourName && onTourComplete) {
        onTourComplete(tourName);
      }
    },
    [onTourComplete],
  );

  const handleSkip = useCallback(
    (step: number, tourName: string | null) => {
      if (tourName && onTourSkip) {
        onTourSkip(tourName, step);
      }
    },
    [onTourSkip],
  );

  const handleStepChange = useCallback(
    (step: number, tourName: string | null) => {
      if (tourName && onStepChange) {
        onStepChange(tourName, step);
      }
    },
    [onStepChange],
  );

  return (
    <NextStepProvider>
      <TourLauncher tours={tours} getPendingTours={getPendingTours} />
      <NextStep
        steps={nextStepTours}
        shadowRgb="0,0,0"
        shadowOpacity="0.5"
        cardComponent={TourCard}
        onComplete={handleComplete}
        onSkip={handleSkip}
        onStepChange={handleStepChange}
      >
        {children}
      </NextStep>
    </NextStepProvider>
  );
}
