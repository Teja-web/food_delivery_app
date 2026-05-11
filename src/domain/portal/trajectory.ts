/**
 * Extract trajectory data from candidate profile JSONB.
 * Returns safe defaults when trajectory data isn't populated yet.
 */

interface TrajectoryTarget {
  role: string;
  readiness: number;
  status: string;
}

interface TrajectoryGap {
  skill: string;
  level: number;
}

interface GrowthPlanStep {
  weeks: string;
  action: string;
}

interface TrajectoryData {
  currentRole: string;
  targets: TrajectoryTarget[];
  gaps: TrajectoryGap[];
  growthPlan: GrowthPlanStep[];
}

export function extractTrajectory(profile: unknown): TrajectoryData | null {
  const prof = profile as Record<string, unknown> | null;
  if (!prof) return null;

  const trajectory = prof.trajectory as Record<string, unknown> | undefined;
  if (!trajectory) return null;

  const currentRole = (trajectory.currentRole as string) || (prof.currentTitle as string) || "";
  if (!currentRole) return null;

  const rawTargets = (trajectory.targets ?? []) as Array<Record<string, unknown>>;
  const targets: TrajectoryTarget[] = rawTargets.map((t) => ({
    role: (t.role as string) || "Unknown",
    readiness: typeof t.readiness === "number" ? t.readiness : 0,
    status: (t.status as string) || "Exploring",
  }));

  if (targets.length === 0) return null;

  const rawGaps = (trajectory.gaps ?? []) as Array<Record<string, unknown>>;
  const gaps: TrajectoryGap[] = rawGaps.map((g) => ({
    skill: (g.skill as string) || "",
    level: typeof g.level === "number" ? g.level : 0,
  }));

  const rawPlan = (trajectory.growthPlan ?? []) as Array<Record<string, unknown>>;
  const growthPlan: GrowthPlanStep[] = rawPlan.map((s) => ({
    weeks: (s.weeks as string) || "",
    action: (s.action as string) || "",
  }));

  return { currentRole, targets, gaps, growthPlan };
}
