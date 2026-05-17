import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { AutonomyPill, type AutonomyLevel } from "@/components/trust/AutonomyPill";
import { cn } from "@/lib/utils";

const RANK: Record<AutonomyLevel, number> = {
  OBSERVE: 0,
  PROPOSE: 1,
  MERGE: 2,
  LEAD: 3,
};

export function LevelChange({
  from,
  to,
  className,
}: {
  from: AutonomyLevel;
  to: AutonomyLevel;
  className?: string;
}) {
  const direction = RANK[to] > RANK[from] ? "up" : RANK[to] < RANK[from] ? "down" : "flat";
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : ArrowRight;
  const iconColor =
    direction === "up"
      ? "text-trend-up"
      : direction === "down"
        ? "text-trend-down"
        : "text-trend-flat";

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <AutonomyPill level={from} />
      <Icon className={cn("h-3.5 w-3.5", iconColor)} aria-hidden />
      <AutonomyPill level={to} />
    </span>
  );
}
