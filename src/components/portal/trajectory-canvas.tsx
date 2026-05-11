"use client";

import Link from "next/link";
import { Compass } from "lucide-react";

export interface TrajectoryTarget {
  role: string;
  readiness: number;
  status: string;
}

export interface TrajectoryGap {
  skill: string;
  level: number;
}

export interface GrowthPlanStep {
  weeks: string;
  action: string;
}

export interface TrajectoryData {
  currentRole: string;
  targets: TrajectoryTarget[];
  gaps: TrajectoryGap[];
  growthPlan: GrowthPlanStep[];
}

const NODE_POSITIONS = [
  { top: "24%", left: "76%" },
  { top: "60%", left: "80%" },
  { top: "82%", left: "42%" },
];

const STATUS_COLORS: Record<string, string> = {
  Ready: "text-emerald-600",
  Growing: "text-amber-600",
  Exploring: "text-muted-foreground",
};

export function TrajectoryCanvas({ data }: { data: TrajectoryData }) {
  const selectedTarget = data.targets[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-teal-600 mb-1">
          <Compass className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Career Trajectory</span>
        </div>
        <p className="text-sm text-muted-foreground">
          AI-mapped next moves based on your skills, experience, and readiness
        </p>
      </div>

      {/* Canvas */}
      <div className="relative min-h-[360px] rounded-xl border border-border bg-card overflow-hidden">
        <div
          className="absolute z-10 flex h-[110px] w-[110px] flex-col items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-center shadow-lg shadow-amber-500/20"
          style={{ top: "50%", left: "40%", transform: "translate(-50%, -50%)" }}
        >
          <span className="text-[11px] font-bold text-white">{data.currentRole}</span>
          <span className="text-[9px] text-white/80">Current Role</span>
        </div>

        {data.targets.map((target, i) => (
          <div
            key={`${target.role}-${i}`}
            className="absolute z-10 flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full border-2 border-border bg-card text-center transition-all hover:border-amber-500 hover:shadow-md hover:shadow-amber-500/10 cursor-pointer"
            style={{ top: NODE_POSITIONS[i]?.top, left: NODE_POSITIONS[i]?.left, transform: "translate(-50%, -50%)" }}
          >
            <span className="text-lg font-extrabold text-amber-600">{target.readiness}%</span>
            <span className="text-[9px] font-semibold text-foreground">{target.role}</span>
            <span className={`text-[8px] ${STATUS_COLORS[target.status] ?? "text-muted-foreground"}`}>{target.status}</span>
          </div>
        ))}

        <svg className="absolute inset-0 z-0 h-full w-full" preserveAspectRatio="none">
          {data.targets.map((_, i) => (
            <line
              key={i}
              x1="40%" y1="50%"
              x2={NODE_POSITIONS[i]?.left} y2={NODE_POSITIONS[i]?.top}
              stroke="hsl(var(--border))" strokeWidth="2"
            />
          ))}
        </svg>
      </div>

      {/* Gap Analysis */}
      {selectedTarget && data.gaps.length > 0 && (
        <div className="rounded-xl border border-amber-200/40 bg-amber-50/30 p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-600 mb-3">
            Skills gap &mdash; {selectedTarget.role} ({selectedTarget.readiness}% ready)
          </h3>
          <div className="space-y-3">
            {data.gaps.map((gap) => (
              <div key={gap.skill} className="flex items-center gap-3">
                <span className="w-[140px] text-xs text-foreground">{gap.skill}</span>
                <div className="flex-1 h-1 rounded-full bg-amber-200 overflow-hidden">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${gap.level}%` }} />
                </div>
                <Link href="/prep" className="text-[11px] font-semibold text-amber-600 hover:text-amber-700 shrink-0">
                  Practice &rarr;
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 90-Day Growth Plan */}
      {data.growthPlan.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">90-Day Growth Plan</h3>
          <div className="space-y-0 divide-y divide-border/50">
            {data.growthPlan.map((step) => (
              <div key={step.weeks} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span className="w-[68px] shrink-0 text-[11px] font-bold text-amber-600">{step.weeks}</span>
                <p className="text-xs text-muted-foreground">{step.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
