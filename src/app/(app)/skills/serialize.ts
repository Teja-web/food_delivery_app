import type { Skill } from "@/db/schema/skill";
import type { LevelName, SkillAutonomyState } from "@/operations/skill-autonomy";

export type LevelLabel = "INTERN" | "JUNIOR" | "SENIOR" | "PRINCIPAL";

export function levelLabel(level: number): LevelLabel {
  if (level >= 3) return "PRINCIPAL";
  if (level >= 2) return "SENIOR";
  if (level >= 1) return "JUNIOR";
  return "INTERN";
}

export interface SkillStats30d {
  success: number;
  rollback: number;
  incident: number;
  windowDays: number;
  sparkline: number[];
}

export interface SkillLedgerRowClient {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  enabled: boolean;
  projectId: string | null;
  level: number;
  levelLabel: LevelLabel;
  levelName: LevelName;
  levelSetAt: string | null;
  nextReviewAt: string | null;
  lastReason: string | null;
  stats: SkillStats30d;
}

export interface AutonomyEventClient {
  skillId: string;
  skillSlug: string;
  skillName: string;
  kind: "promotion" | "demotion" | "review";
  fromLabel: LevelLabel | null;
  toLabel: LevelLabel;
  level: number;
  reason: string | null;
  occurredAt: string;
  ageLabel: string;
}

export interface AutonomyDistribution {
  intern: number;
  junior: number;
  senior: number;
  principal: number;
  total: number;
}

export interface SkillsLedgerClient {
  events: AutonomyEventClient[];
  rows: SkillLedgerRowClient[];
  distribution: AutonomyDistribution;
}

function formatAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (days >= 1) return `${days}d ago`;
  if (hours >= 1) return `${hours}h ago`;
  return "just now";
}

export function serializeSkillRow(
  skill: Skill,
  autonomy: SkillAutonomyState,
  stats: SkillStats30d,
): SkillLedgerRowClient {
  return {
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    enabled: skill.enabled,
    projectId: skill.projectId ?? null,
    level: autonomy.level,
    levelLabel: levelLabel(autonomy.level),
    levelName: autonomy.levelName,
    levelSetAt: autonomy.levelSetAt.getTime() ? autonomy.levelSetAt.toISOString() : null,
    nextReviewAt: autonomy.nextReviewAt?.toISOString() ?? null,
    lastReason: autonomy.lastReason,
    stats,
  };
}

export function serializeAutonomyEvent(args: {
  skill: { id: string; slug: string; name: string };
  autonomy: SkillAutonomyState;
}): AutonomyEventClient | null {
  const reason = args.autonomy.lastReason ?? "";
  let kind: AutonomyEventClient["kind"] = "review";
  if (reason.startsWith("promoted")) kind = "promotion";
  else if (reason.startsWith("demoted")) kind = "demotion";
  else return null;
  const occurred = args.autonomy.levelSetAt;
  return {
    skillId: args.skill.id,
    skillSlug: args.skill.slug,
    skillName: args.skill.name,
    kind,
    fromLabel: null, // schema doesn't keep history; would need an autonomy_events table
    toLabel: levelLabel(args.autonomy.level),
    level: args.autonomy.level,
    reason,
    occurredAt: occurred.toISOString(),
    ageLabel: formatAge(occurred),
  };
}
