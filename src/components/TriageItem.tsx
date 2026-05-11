"use client";

import { useTransition } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CircleAlert,
  Lightbulb,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface TriageItemProps {
  id?: string;
  entityId?: string;
  entityType?: string;
  title: string;
  action?: string | null;
  subtitle?: string | null;
  urgency: string;
  className?: string;
  onApprove?: () => Promise<void>;
  onDismiss?: () => Promise<void>;
  onAskAI?: () => void;
  showActions?: boolean;
}

export function TriageItem({
  id,
  entityId,
  entityType,
  title,
  action,
  subtitle,
  urgency,
  className,
  onApprove,
  onDismiss,
  onAskAI,
  showActions = false,
}: TriageItemProps) {
  const [isPending, startTransition] = useTransition();
  const isHigh = urgency === "high" || urgency === "critical";
  const isMedium = urgency === "medium";

  const handleApprove = () => {
    if (onApprove) {
      startTransition(async () => {
        await onApprove();
      });
    }
  };

  const handleDismiss = () => {
    if (onDismiss) {
      startTransition(async () => {
        await onDismiss();
      });
    }
  };

  const ctaTone = isHigh
    ? "bg-red-600 text-white hover:bg-red-700"
    : isMedium
      ? "bg-amber-500 text-white hover:bg-amber-600"
      : "bg-foreground text-background hover:opacity-90";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {isHigh || isMedium ? (
        <div className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded",
          isHigh ? "bg-red-50 dark:bg-red-950/40" : "bg-amber-50 dark:bg-amber-950/40",
        )}>
          {isHigh
            ? <AlertTriangle className="h-3 w-3 text-red-500" />
            : <CircleAlert className="h-3 w-3 text-amber-500" />
          }
        </div>
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gradient-to-br from-amber-400 to-amber-500">
          <Lightbulb className="h-3 w-3 text-white" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {subtitle && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
        )}
      </div>

      {/* Right-side actions */}
      {(action || showActions) && (
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {action && (
            onApprove ? (
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isPending}
                className={cn("text-[11px] font-semibold", ctaTone)}
              >
                <ArrowRight className="h-3 w-3" />
                {action}
              </Button>
            ) : (
              <span className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold",
                ctaTone,
              )}>
                <ArrowRight className="h-3 w-3" />
                {action}
              </span>
            )
          )}
          {showActions && onDismiss && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={handleDismiss}
              disabled={isPending}
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          {showActions && onAskAI && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground/50 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              onClick={onAskAI}
              title="Ask AI about this"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
