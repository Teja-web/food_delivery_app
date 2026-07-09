"use client";

import Link from "next/link";
import { Shield, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type {
  CockpitRuleClient,
  CockpitSkillClient,
} from "../serialize";

const SEVERITY_CLASS: Record<CockpitRuleClient["severity"], string> = {
  info: "border-border/60 text-muted-foreground",
  warn: "border-state-pending/40 text-state-pending",
  error: "border-state-failed/40 text-state-failed",
};

export function RulesSkillsTab({
  rules,
  skills,
}: {
  rules: CockpitRuleClient[];
  skills: CockpitSkillClient[];
}) {
  const projectScopedRules = rules.filter((r) => r.scope === "project").length;
  const orgScopedRules = rules.length - projectScopedRules;
  const projectScopedSkills = skills.filter((s) => s.scope === "project").length;
  const orgScopedSkills = skills.length - projectScopedSkills;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="font-display text-base font-semibold">Policies in force</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>{projectScopedRules} project</span>
              <span className="opacity-40">·</span>
              <span>{orgScopedRules} org</span>
            </div>
          </div>
          {rules.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No rules apply to this project ·{" "}
              <Link href="/rules" className="text-primary hover:underline">
                Declare a rule
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link
                    href={`/rules?slug=${encodeURIComponent(r.slug)}`}
                    className="min-w-0 flex-1 truncate text-sm hover:underline"
                    title={r.title}
                  >
                    {r.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("px-1.5 py-0 font-mono text-[10px] uppercase", SEVERITY_CLASS[r.severity])}
                    >
                      {r.severity}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="px-1.5 py-0 font-mono text-[10px] uppercase text-muted-foreground"
                      title={r.scope === "project" ? "Scoped to this project" : "Applies org-wide"}
                    >
                      {r.scope === "project" ? "proj" : "org"}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="font-display text-base font-semibold">Available skills</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>{projectScopedSkills} project</span>
              <span className="opacity-40">·</span>
              <span>{orgScopedSkills} org</span>
            </div>
          </div>
          {skills.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No skills available. Platform skills are seeded via db-setup.
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {skills.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link
                    href={`/skills/${s.id}`}
                    className="min-w-0 flex-1 truncate text-sm hover:underline"
                    title={s.description ?? s.name}
                  >
                    {s.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-1">
                    {s.isPlatform ? (
                      <Badge
                        variant="outline"
                        className="border-autonomy-lead/40 px-1.5 py-0 font-mono text-[10px] uppercase text-autonomy-lead"
                        title="Platform skill — invoke from Cursor via invoke_skill"
                      >
                        platform
                      </Badge>
                    ) : null}
                    <Badge
                      variant="outline"
                      className="px-1.5 py-0 font-mono text-[10px] uppercase text-muted-foreground"
                      title={s.scope === "project" ? "Scoped to this project" : "Available org-wide"}
                    >
                      {s.scope === "project" ? "proj" : "org"}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
