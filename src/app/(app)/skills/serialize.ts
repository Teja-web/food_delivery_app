import type { Skill } from "@/db/schema/skill";
import type { LevelName, SkillAutonomyState } from "@/operations/skill-autonomy";

export type LevelLabel = "OBSERVE" | "PROPOSE" | "MERGE" | "LEAD";

export function levelLabel(level: number): LevelLabel {
  if (level >= 3) return "LEAD";
  if (level >= 2) return "MERGE";
  if (level >= 1) return "PROPOSE";
  return "OBSERVE";
}

export interface SkillStats30d {
  success: number;
  rollback: number;
  incident: number;
  windowDays: number;
  sparkline: number[];
}

export interface ChoreographyIndicator {
  version: string;
  hash: string;
  /** Advisory minimum autonomy declared in frontmatter. */
  minAutonomy: "observe" | "propose" | "merge" | "lead" | null;
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
  /**
   * Lowest autonomy this skill holds across all projects where it has a
   * per-project autonomy row. `null` when the skill has no per-project
   * autonomy data yet (org-wide view falls back to `level`).
   */
  lowestAutonomyAcrossProjects: LevelLabel | null;
  /** Number of distinct projects with a `skill_autonomy` row for this skill. */
  projectAutonomyCount: number;
  /**
   * Presence + identity of the pushed `CHOREOGRAPHY.md` for this skill.
   * `null` when no choreography file exists yet (the skill is server-only
   * for now). The skill list doubles as the choreography catalog.
   */
  choreography: ChoreographyIndicator | null;
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
  acrossProjects?: { level: number }[],
  choreography?: ChoreographyIndicator | null,
): SkillLedgerRowClient {
  // Lowest autonomy across projects: scan rows from getSkillAutonomyAcrossProjects.
  // We only include rows whose projectId is non-null — the legacy org-wide
  // row (projectId=null) is a default and would always be 0/Observe.
  let lowestAutonomyAcrossProjects: LevelLabel | null = null;
  let projectAutonomyCount = 0;
  if (acrossProjects && acrossProjects.length > 0) {
    projectAutonomyCount = acrossProjects.length;
    const minLevel = acrossProjects.reduce(
      (m, r) => Math.min(m, r.level),
      Number.POSITIVE_INFINITY,
    );
    if (Number.isFinite(minLevel)) {
      lowestAutonomyAcrossProjects = levelLabel(minLevel);
    }
  }

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
    lowestAutonomyAcrossProjects,
    projectAutonomyCount,
    choreography: choreography ?? null,
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
