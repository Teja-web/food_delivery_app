import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

export type TrendDirection = "up" | "down" | "flat";
export type TrendTone = "success" | "warning" | "danger" | "neutral";

const TONE_CLASS: Record<TrendTone, string> = {
  success: "text-trend-up",
  warning: "text-state-pending",
  danger: "text-trend-down",
  neutral: "text-muted-foreground",
};

type Props = {
  direction: TrendDirection;
  value?: string;
  tone?: TrendTone;
  className?: string;
};

export function TrendIndicator({ direction, value, tone, className }: Props) {
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  const resolvedTone: TrendTone =
    tone ?? (direction === "up" ? "success" : direction === "down" ? "danger" : "neutral");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums",
        TONE_CLASS[resolvedTone],
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {value ? <span>{value}</span> : null}
    </span>
  );
}
