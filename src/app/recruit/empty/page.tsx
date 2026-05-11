"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  Sun,
  Upload,
  Users,
} from "lucide-react";

/* -- Page ------------------------------------------------------------ */

export default function EmptyStatePage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="space-y-10">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-amber-600 mb-4">
              <Sun className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wider">Getting started</span>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Welcome to Recruit</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto">
              Your hiring operating system. Set up your first role and the platform will start
              matching candidates, scheduling interviews, and guiding you toward accepted offers.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground text-center">Set up in 4 steps</h2>

            <Link href="/recruit/roles/new" className="flex items-center gap-4 rounded-2xl border-2 border-primary/20 bg-primary/5 p-5 hover:border-primary/40 transition-all group">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Briefcase className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">1. Open your first role</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Define the opportunity, criteria, and interview plan. The system starts matching immediately.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>

            <Link href="/recruit/pools" className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 hover:shadow-sm transition-all group">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">2. Build a talent pool</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Create a candidate segment that feeds recommendations into your roles. Import from a CSV, connect sourcing channels, or start from scratch.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>

            <Link href="/recruit/assessments" className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 hover:shadow-sm transition-all group">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">3. Create assessment templates</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Define scorecards and evaluation rubrics. These auto-trigger when candidates reach the right stage.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>

            <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <CalendarClock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">4. Connect your calendar</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Link Google Calendar or Outlook so the system can check availability and send interview invites automatically.</p>
              </div>
              <Button variant="soft" size="auto" className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium">Connect</Button>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center">
            <Upload className="h-6 w-6 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">Already have candidate data?</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              Import candidates from a CSV, connect your ATS, or paste LinkedIn profile URLs.
              The system will index profiles and start matching them to your roles.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button variant="soft" size="auto" className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground">Import CSV</Button>
              <Button variant="soft" size="auto" className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground">Connect ATS</Button>
              <Button variant="soft" size="auto" className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground">Paste LinkedIn URLs</Button>
            </div>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50/30 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[8px]">✦</div>
              <p className="text-xs font-semibold text-amber-900">What happens once you set up</p>
            </div>
            <ul className="space-y-2 text-xs leading-relaxed text-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>The <strong>Today</strong> page becomes your daily triage — decisions, interviews, and risks surface here.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>Each role gets a <strong>Recommended</strong> tab where the system surfaces matched candidates for your review.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>When you advance candidates, the system auto-assigns assessments and suggests interview slots.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span><strong>Insights</strong> tracks your hiring velocity, source effectiveness, and pipeline health in real time.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
