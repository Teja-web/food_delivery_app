import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AutonomyPill } from "@/components/trust/AutonomyPill";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkline } from "@/components/viz/Sparkline";
import type { Skill } from "@/db/schema/skill";
import { getSkill } from "@/actions/skills";
import {
  getSkillAutonomy,
  getSkillStats30d,
  LEVEL_BLURBS,
} from "@/operations/skill-autonomy";

import { levelLabel } from "../serialize";

const LEVEL_CRITERIA: Record<"INTERN" | "JUNIOR" | "SENIOR" | "PRINCIPAL", string> = {
  INTERN: "5+ successful invocations to reach Junior",
  JUNIOR: "≥90% success rate across 5+ invocations and ≥14 days at level to reach Senior",
  SENIOR: "≥90% success rate, no critical incidents, ≥14 days at level to reach Principal",
  PRINCIPAL: "Top of the ladder. Stays until a critical incident demotes.",
};

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const skill = (await getSkill(id)) as Skill | null;
  if (!skill) notFound();

  const [autonomy, stats] = await Promise.all([getSkillAutonomy(skill.id), getSkillStats30d(skill.id)]);
  const label = levelLabel(autonomy.level);
  const sparkDirection = stats.success === 0 ? "flat" : stats.incident > 0 ? "down" : "up";

  return (
    <div className="space-y-6">
      <Link
        href="/skills"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Skills ledger
      </Link>

      <header className="flex items-start justify-between gap-6 border-b pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{skill.name}</h1>
            <AutonomyPill level={label} title={autonomy.lastReason ?? undefined} />
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {skill.slug}
            {skill.projectId ? null : <span className="ml-1 opacity-70">· org-wide</span>}
          </p>
          {skill.description ? (
            <p className="mt-2 max-w-2xl text-sm text-foreground/85">{skill.description}</p>
          ) : null}
        </div>
        <Badge
          variant="outline"
          className={skill.enabled ? "border-trend-up/40 text-trend-up" : "text-muted-foreground"}
        >
          {skill.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                30-day outcomes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex items-baseline gap-6">
                <div>
                  <div className="font-display text-3xl font-bold tabular-nums text-trend-up">
                    {stats.success}
                  </div>
                  <div className="text-[11px] text-muted-foreground">successes</div>
                </div>
                <div>
                  <div className="font-display text-3xl font-bold tabular-nums text-verdict-rollback">
                    {stats.rollback}
                  </div>
                  <div className="text-[11px] text-muted-foreground">rollbacks</div>
                </div>
                <div>
                  <div className="font-display text-3xl font-bold tabular-nums text-verdict-incident">
                    {stats.incident}
                  </div>
                  <div className="text-[11px] text-muted-foreground">incidents</div>
                </div>
                <div className="ml-auto">
                  <Sparkline
                    points={stats.sparkline}
                    direction={sparkDirection}
                    width={160}
                    height={36}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Current level &amp; criteria
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              <div className="flex items-center gap-2">
                <AutonomyPill level={label} />
                <span className="text-foreground/85">{LEVEL_BLURBS[autonomy.levelName]}</span>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Criteria for next level
                </div>
                <div className="text-foreground/85">{LEVEL_CRITERIA[label]}</div>
              </div>
              {autonomy.lastReason ? (
                <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    Last decision
                  </div>
                  <div className="text-foreground/85">{autonomy.lastReason}</div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 text-xs text-muted-foreground">
              <div>
                Level set:{" "}
                <span className="font-mono text-foreground">
                  {autonomy.levelSetAt.getTime()
                    ? autonomy.levelSetAt.toLocaleDateString()
                    : "never"}
                </span>
              </div>
              <div>
                Last reviewed:{" "}
                <span className="font-mono text-foreground">
                  {autonomy.lastReviewedAt
                    ? autonomy.lastReviewedAt.toLocaleDateString()
                    : "never"}
                </span>
              </div>
              <div>
                Next review:{" "}
                <span className="font-mono text-foreground">
                  {autonomy.nextReviewAt
                    ? autonomy.nextReviewAt.toLocaleDateString()
                    : "—"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
