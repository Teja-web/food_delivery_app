"use client";

import { useState, useTransition } from "react";
import { Briefcase, Compass, GraduationCap } from "lucide-react";
import { updateCandidateKind } from "@/actions/portal";

const OPTIONS = [
  {
    value: "professional",
    label: "Professional",
    description: "Experienced — match against full-time roles by resume + history.",
    icon: Briefcase,
  },
  {
    value: "early_career",
    label: "Early career",
    description: "Graduated within the last 18 months. Mix of student + professional matching.",
    icon: Compass,
  },
  {
    value: "student",
    label: "Student",
    description: "In school. Match against internships + new-grad roles using projects + coursework.",
    icon: GraduationCap,
  },
] as const;

export function KindToggle({
  initialKind,
}: {
  initialKind: "professional" | "student" | "early_career";
}) {
  const [kind, setKind] = useState<typeof initialKind>(initialKind);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(next: typeof initialKind) {
    if (next === kind) return;
    const previous = kind;
    setKind(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateCandidateKind(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update");
        setKind(previous);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">
        Where you are
      </p>
      <h2 className="mb-4 font-display text-lg font-semibold text-foreground">
        I'm looking for...
      </h2>
      <div className="space-y-2">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = kind === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => pick(opt.value)}
              disabled={pending && selected}
              className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                selected
                  ? "border-amber-300 bg-amber-50/40"
                  : "border-border hover:border-amber-200"
              }`}
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  selected ? "text-amber-600" : "text-muted-foreground"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {opt.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
    </section>
  );
}
