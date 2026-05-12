import { AutonomyPill, type AutonomyLevel } from "@/components/trust/AutonomyPill";
import { cn } from "@/lib/utils";

export type SkillStats = {
  success: number;
  rollback: number;
  incident: number;
  windowDays: number;
};

type Props = {
  level: AutonomyLevel;
  stats: SkillStats;
  className?: string;
};

export function SkillTrackRecord({ level, stats, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1",
        className,
      )}
    >
      <AutonomyPill level={level} />
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
        <span className="text-trend-up">{stats.success}✓</span>
        <span className="mx-1 opacity-40">/</span>
        <span className="text-verdict-rollback">{stats.rollback}↻</span>
        <span className="mx-1 opacity-40">/</span>
        <span className="text-verdict-incident">{stats.incident}⚡</span>
        <span className="ml-1.5 opacity-60">{stats.windowDays}d</span>
      </span>
    </span>
  );
}
