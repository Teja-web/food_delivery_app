import { notFound } from "next/navigation";

import { AttributionChip } from "@/components/trust/AttributionChip";
import { AutonomyPill, type AutonomyLevel } from "@/components/trust/AutonomyPill";
import { GateDot, type GateState } from "@/components/trust/GateDot";
import { GateStateRow } from "@/components/trust/GateStateRow";
import { LevelChange } from "@/components/trust/LevelChange";
import { SkillTrackRecord } from "@/components/trust/SkillTrackRecord";
import { StatusDot, type StatusLevel } from "@/components/trust/StatusDot";
import { TrendIndicator } from "@/components/trust/TrendIndicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SmallMultiples } from "@/components/viz/SmallMultiples";
import { Sparkline } from "@/components/viz/Sparkline";

const AUTONOMY_LEVELS: AutonomyLevel[] = ["INTERN", "JUNIOR", "SENIOR", "PRINCIPAL"];
const GATE_STATES: GateState[] = ["pending", "passed", "failed", "skipped"];
const STATUS_LEVELS: StatusLevel[] = ["healthy", "warning", "danger", "neutral"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card/40 p-4">
        {children}
      </div>
    </section>
  );
}

function ThemeFrame({ theme, children }: { theme: "dark" | "light"; children: React.ReactNode }) {
  return (
    <div data-theme={theme} className="bg-background text-foreground rounded-xl border p-6">
      <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="font-mono">data-theme=&quot;{theme}&quot;</span>
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

function Playground() {
  return (
    <>
      <Section title="Autonomy pills">
        {AUTONOMY_LEVELS.map((l) => (
          <AutonomyPill key={l} level={l} />
        ))}
      </Section>

      <Section title="Level change">
        <LevelChange from="JUNIOR" to="SENIOR" />
        <LevelChange from="SENIOR" to="PRINCIPAL" />
        <LevelChange from="SENIOR" to="JUNIOR" />
      </Section>

      <Section title="Gate dots">
        {GATE_STATES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-xs">
            <GateDot state={s} /> {s}
          </span>
        ))}
      </Section>

      <Section title="Status dots">
        {STATUS_LEVELS.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-xs">
            <StatusDot status={s} /> {s}
          </span>
        ))}
      </Section>

      <Section title="Attribution chips">
        <AttributionChip id="gh-pr-1234" href="https://github.com/example/repo/pull/1234" />
        <AttributionChip id="JIRA-OPS-42" />
        <AttributionChip id="audit-log-9c3f" href="/audit" />
      </Section>

      <Section title="Skill track record">
        <SkillTrackRecord
          level="SENIOR"
          stats={{ success: 92, rollback: 1, incident: 0, windowDays: 30 }}
        />
        <SkillTrackRecord
          level="PRINCIPAL"
          stats={{ success: 218, rollback: 0, incident: 0, windowDays: 30 }}
        />
        <SkillTrackRecord
          level="JUNIOR"
          stats={{ success: 8, rollback: 2, incident: 1, windowDays: 30 }}
        />
      </Section>

      <Section title="Trend indicators">
        <TrendIndicator direction="up" value="3pt" />
        <TrendIndicator direction="down" value="2pt" />
        <TrendIndicator direction="flat" value="0" />
        <TrendIndicator direction="up" value="↑1" tone="warning" />
      </Section>

      <Section title="Gate state rows">
        <div className="w-full max-w-xl space-y-1">
          <GateStateRow
            gate={{
              name: "tests",
              state: "passed",
              attribution: { id: "gh-run-9821", href: "#" },
            }}
          />
          <GateStateRow
            gate={{
              name: "code review",
              state: "pending",
              unmetCriterion: "needs second reviewer",
              assignee: "devin",
              ageLabel: "4h",
              attribution: { id: "gh-pr-1234", href: "#" },
            }}
          />
          <GateStateRow
            gate={{
              name: "security scan",
              state: "failed",
              unmetCriterion: "1 high severity finding",
              assignee: "priya",
              ageLabel: "12m",
              attribution: { id: "audit-7a1c", href: "#" },
            }}
          />
          <GateStateRow gate={{ name: "perf benchmark", state: "skipped" }} />
        </div>
      </Section>

      <Section title="Sparklines">
        <Sparkline points={[3, 4, 5, 4, 6, 7, 8]} direction="up" />
        <Sparkline points={[8, 7, 6, 7, 5, 4, 3]} direction="down" />
        <Sparkline points={[5, 5, 5, 5, 5, 5, 5]} direction="flat" />
        <Sparkline points={[3, 4, 5, 4, 6, 7, 8]} direction="up" width={120} height={28} />
      </Section>

      <Section title="Small multiples">
        <div className="w-full">
          <SmallMultiples
            rows={[
              { key: "lead", label: "Lead time" },
              { key: "deploy", label: "Deploy freq" },
              { key: "cfr", label: "Change failure" },
              { key: "mttr", label: "MTTR" },
            ]}
            cols={[
              { key: "asm", label: "Auth Svc" },
              { key: "pay", label: "Payments" },
              { key: "dw2", label: "DW v2" },
            ]}
            data={{
              lead: {
                asm: { points: [3, 4, 5, 6, 8], value: "6.2d", direction: "down" },
                pay: { points: [5, 4, 4, 3, 3], value: "3.1d", direction: "up" },
                dw2: undefined,
              },
              deploy: {
                asm: { points: [2, 3, 2, 1, 1], value: "1/wk", direction: "down" },
                pay: { points: [4, 5, 6, 6, 7], value: "7/wk", direction: "up" },
                dw2: undefined,
              },
              cfr: {
                asm: { points: [8, 10, 12, 14, 18], value: "18%", direction: "down" },
                pay: { points: [6, 5, 4, 3, 2], value: "2%", direction: "up" },
                dw2: undefined,
              },
              mttr: {
                asm: { points: [60, 80, 90, 120, 140], value: "140m", direction: "down" },
                pay: { points: [40, 30, 30, 25, 20], value: "20m", direction: "up" },
                dw2: undefined,
              },
            }}
          />
        </div>
      </Section>

      <Section title="Shadcn baseline">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="destructive">Destructive</Badge>
        <Skeleton className="h-6 w-32" />
      </Section>
    </>
  );
}

export default function PlaygroundPage() {
  // Dev-only surface — 404 in production builds. Visual QA for Phase 1
  // composites; not a user-facing page.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Primitives playground</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visual QA for Phase 1 composites. Dark default, light below.
        </p>
      </header>

      <ThemeFrame theme="dark">
        <Playground />
      </ThemeFrame>

      <ThemeFrame theme="light">
        <Playground />
      </ThemeFrame>
    </div>
  );
}
