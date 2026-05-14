import { listSkills } from "@/actions/skills";
import type { Skill } from "@/db/schema/skill";
import { getActionContext } from "@/lib/auth/context";
import {
  getRecentAutonomyEvents,
  getSkillAutonomy,
  getSkillStats30d,
} from "@/operations/skill-autonomy";

import { RecentEventsBanner } from "./RecentEventsBanner";
import {
  levelLabel,
  serializeAutonomyEvent,
  serializeSkillRow,
  type AutonomyDistribution,
  type AutonomyEventClient,
} from "./serialize";
import { SkillsLedgerTable } from "./SkillsLedgerTable";

export default async function SkillsPage() {
  const ctx = await getActionContext();
  const { items } = await listSkills({ limit: 200 });
  const skills = items as Skill[];

  // Transitional: the skills ledger view is org-wide today. Per-project views
  // arrive in Milestone B (see docs/architecture.md). Passing projectId=null
  // reads the legacy / org-wide autonomy row.
  const [autonomy, stats, recentEvents] = await Promise.all([
    Promise.all(skills.map((s) => getSkillAutonomy(s.id, null))),
    Promise.all(skills.map((s) => getSkillStats30d(s.id, null))),
    getRecentAutonomyEvents(ctx.organizationId, 14),
  ]);

  const rows = skills.map((s, i) => serializeSkillRow(s, autonomy[i], stats[i]));

  const distribution: AutonomyDistribution = rows.reduce(
    (acc, r) => {
      const label = levelLabel(r.level);
      if (label === "INTERN") acc.intern += 1;
      else if (label === "JUNIOR") acc.junior += 1;
      else if (label === "SENIOR") acc.senior += 1;
      else if (label === "PRINCIPAL") acc.principal += 1;
      acc.total += 1;
      return acc;
    },
    { intern: 0, junior: 0, senior: 0, principal: 0, total: 0 } as AutonomyDistribution,
  );

  const eventsBySkill = new Map(recentEvents.map((e) => [e.skillId, e]));
  const events: AutonomyEventClient[] = [];
  for (const skill of skills) {
    const e = eventsBySkill.get(skill.id);
    if (!e) continue;
    const event = serializeAutonomyEvent({
      skill: { id: skill.id, slug: skill.slug, name: skill.name },
      autonomy: {
        skillId: skill.id,
        projectId: e.projectId,
        organizationId: ctx.organizationId,
        level: e.level,
        levelName: (["intern", "junior", "senior", "principal"] as const)[e.level] ?? "intern",
        levelSetAt: e.levelSetAt,
        lastReviewedAt: null,
        nextReviewAt: null,
        lastReason: e.lastReason,
      },
    });
    if (event) events.push(event);
  }
  events.sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-semibold">Skills — autonomy ledger</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trust over time. Outcomes earn auto-merge; incidents revoke it.
        </p>
      </header>

      <RecentEventsBanner events={events} />

      <SkillsLedgerTable rows={rows} distribution={distribution} />
    </div>
  );
}
