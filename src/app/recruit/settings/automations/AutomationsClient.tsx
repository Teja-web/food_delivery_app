"use client";

import {
  Bot,
  FlaskConical,
  GitBranch,
  Lock,
  Mail,
  Shield,
  Sparkles,
  UserX,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Static mock data — no backend wired yet                           */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  {
    label: "Pipeline",
    automations: [
      {
        key: "auto_advance_high_fit",
        name: "Auto-advance high-confidence candidates",
        description:
          "When a candidate's evidence is complete and confidence exceeds your threshold, automatically advance them to the next pipeline stage.",
        icon: GitBranch,
        defaultThreshold: 85,
        thresholdLabel: "Confidence threshold",
        thresholdUnit: "%",
      },
      {
        key: "auto_reject_low_fit",
        name: "Auto-reject low-fit candidates",
        description:
          "Automatically reject candidates below a fit score threshold. A rejection email is drafted but only sent if auto-send is enabled.",
        icon: UserX,
        defaultThreshold: 25,
        thresholdLabel: "Fit score threshold",
        thresholdUnit: "",
      },
      {
        key: "auto_assign_assessment",
        name: "Auto-assign assessments on pipeline entry",
        description:
          "When a candidate enters the pipeline, the system auto-assigns the first matching assessment with a 7-day deadline.",
        icon: Sparkles,
        alwaysOn: true,
      },
    ],
  },
  {
    label: "Engagement",
    automations: [
      {
        key: "auto_send_outreach",
        name: "Auto-send outreach to strong matches",
        description:
          "When the engagement drafter produces a high-confidence draft, automatically send it to the candidate.",
        icon: Mail,
        defaultThreshold: 80,
        thresholdLabel: "Draft confidence",
        thresholdUnit: "%",
      },
    ],
  },
  {
    label: "Lifecycle",
    automations: [
      {
        key: "auto_close_filled_role",
        name: "Auto-close role when filled",
        description:
          "When the number of accepted offers equals the role's headcount target, automatically close the role and notify the team.",
        icon: Shield,
      },
    ],
  },
  {
    label: "Notifications",
    automations: [
      {
        key: "auto_remind_overdue_scorecard",
        name: "Auto-send scorecard reminders",
        description:
          "When a scorecard is overdue by more than 24 hours, automatically send a reminder to the interviewer.",
        icon: Zap,
      },
    ],
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AutomationsClient() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="space-y-8">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Bot className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Automations
              </span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
              Configure what the system handles automatically
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Set thresholds and toggle which actions run autonomously vs. require your approval.
            </p>
          </div>

          {/* Future-feature banner */}
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-300">
                Coming soon — preview only
              </p>
              <p className="mt-0.5 text-amber-700/80 dark:text-amber-400/70">
                Automations will be enabled once we have enough confidence in the
                system's recommendations. For now this page shows what's planned.
                All toggles are disabled.
              </p>
            </div>
          </div>

          {/* Automation cards by category */}
          {CATEGORIES.map((category) => (
            <section key={category.label}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {category.label}
              </h2>
              <div className="space-y-3">
                {category.automations.map((auto) => (
                  <AutomationCard key={auto.key} automation={auto} />
                ))}
              </div>
            </section>
          ))}

          {/* Activity section — placeholder */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Activity
            </h2>
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
              <Lock className="mx-auto h-5 w-5 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                Execution history will appear here once automations are active.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AutomationCard                                                     */
/* ------------------------------------------------------------------ */

interface AutomationDef {
  key: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultThreshold?: number;
  thresholdLabel?: string;
  thresholdUnit?: string;
  alwaysOn?: boolean;
}

function AutomationCard({ automation }: { automation: AutomationDef }) {
  const Icon = automation.icon;

  return (
    <div className="group rounded-xl border border-border bg-card p-4 opacity-75 transition-opacity hover:opacity-100">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {automation.name}
              </p>
              {automation.alwaysOn && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
                  Active
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {automation.description}
            </p>
          </div>
        </div>

        {/* Disabled toggle */}
        <div
          className="mt-1 h-5 w-9 shrink-0 rounded-full bg-muted cursor-not-allowed"
          title="Coming soon"
        >
          <div className="h-5 w-5 rounded-full border border-border bg-card shadow-sm transition-transform translate-x-0" />
        </div>
      </div>

      {/* Threshold slider (visual only) */}
      {automation.defaultThreshold != null && (
        <div className="mt-3 ml-11">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">
              {automation.thresholdLabel}
            </span>
            <span className="font-medium text-foreground tabular-nums">
              {automation.defaultThreshold}
              {automation.thresholdUnit}
            </span>
          </div>
          <div className="relative mt-1.5 h-1.5 w-full rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
              style={{ width: `${automation.defaultThreshold}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-primary/30 bg-card"
              style={{ left: `${automation.defaultThreshold}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
