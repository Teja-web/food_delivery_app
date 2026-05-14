import { listProjects } from "@/actions/projects";
import { listSkills } from "@/actions/skills";
import type { Project } from "@/db/schema/project";
import type { Skill } from "@/db/schema/skill";
import { getActionContext } from "@/lib/auth/context";
import {
  getRecentAutonomyEvents,
  getSkillAutonomy,
  getSkillStats30d,
} from "@/operations/skill-autonomy";

import { ProjectFilter } from "./ProjectFilter";
import { RecentEventsBanner } from "./RecentEventsBanner";
import {
  levelLabel,
  serializeAutonomyEvent,
  serializeSkillRow,
  type AutonomyDistribution,
  type AutonomyEventClient,
} from "./serialize";
import { SkillsLedgerTable } from "./SkillsLedgerTable";

export default async function SkillsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const ctx = await getActionContext();
  const sp = await searchParams;
  const filterProjectId = sp.projectId && sp.projectId !== "all" ? sp.projectId : null;

  const [skillsList, projectsList] = await Promise.all([
    listSkills({ limit: 200 }),
    listProjects({ limit: 200 }),
  ]);
  const skills = skillsList.items as Skill[];
  const projects = (projectsList.items ?? []) as Project[];

  // When a project is selected, autonomy + stats read per-project rows. When
  // null, we read the legacy / org-wide rows (the projectId=null lane that
  // pre-Milestone-A data uses). New (skill, project) pairs default to
  // level-0 intern until `recomputeSkillAutonomy` runs at least once.
  const [autonomy, stats, recentEvents] = await Promise.all([
    Promise.all(skills.map((s) => getSkillAutonomy(s.id, filterProjectId))),
    Promise.all(skills.map((s) => getSkillStats30d(s.id, filterProjectId))),
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

  // Recent events get filtered to the selected project too — otherwise the
  // banner shows promotions on other projects that aren't currently in view.
  const eventsBySkill = new Map(
    recentEvents
      .filter((e) => (filterProjectId ? e.projectId === filterProjectId : true))
      .map((e) => [e.skillId, e]),
  );
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

  const selectedProject = filterProjectId
    ? projects.find((p) => p.id === filterProjectId) ?? null
    : null;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Skills — autonomy ledger</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedProject
              ? `Trust earned on ${selectedProject.name}. Each skill restarts at intern on a new project.`
              : "Trust over time across the org. Use the project filter to see per-project autonomy."}
          </p>
        </div>
        <ProjectFilter
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          activeProjectId={filterProjectId}
        />
      </header>

      <RecentEventsBanner events={events} />

      <SkillsLedgerTable rows={rows} distribution={distribution} />
    </div>
  );
}
