"use client";

import type { CardComponentProps } from "nextstepjs";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TourCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) {
  return (
    <div className="bg-card text-card-foreground w-80 rounded-sm border shadow-lg">
      <div className="flex flex-col gap-3 p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {step.icon && <span className="text-lg">{step.icon}</span>}
            <h3 className="text-sm font-semibold leading-none">{step.title}</h3>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={skipTour}
            className="text-muted-foreground hover:text-foreground -mr-1 -mt-1 rounded-sm transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Content */}
        <div className="text-muted-foreground text-sm">{step.content}</div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-muted-foreground text-xs">
            {currentStep + 1} of {totalSteps}
          </span>
          <div className="flex items-center gap-1.5">
            {currentStep > 0 && (
              <Button
                variant="secondary"
                onClick={prevStep}
                className="hover:bg-secondary/80 inline-flex h-7 items-center gap-1 rounded-sm px-2.5 text-xs font-medium transition-colors"
              >
                <ChevronLeft className="h-3 w-3" />
                Back
              </Button>
            )}
            <Button
              variant="default"
              onClick={nextStep}
              className="hover:bg-primary/90 inline-flex h-7 items-center gap-1 rounded-sm px-2.5 text-xs font-medium transition-colors"
            >
              {currentStep === totalSteps - 1 ? "Done" : "Next"}
              {currentStep < totalSteps - 1 && (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      </div>
      <div className="[&_svg_polygon]:fill-card [&_svg_path]:fill-card">{arrow}</div>
    </div>
  );
}
