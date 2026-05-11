"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Minus, AlertTriangle, Brain, Sparkles, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoleDetailData, RoleDetailAlignment } from "./serialize";

function AlignmentIcon({ rating }: { rating: RoleDetailAlignment["rating"] }) {
  switch (rating) {
    case "strong":
      return <Check className="h-3.5 w-3.5 text-emerald-500" />;
    case "partial":
      return <Minus className="h-3.5 w-3.5 text-amber-500" />;
    case "gap":
      return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />;
  }
}

export function RoleOverviewClient({ role, roleId }: { role: RoleDetailData; roleId: string }) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const strongCount = role.alignment.filter((a) => a.rating === "strong").length;
  const totalCount = role.alignment.length;

  return (
    <div className="space-y-6">
      {/* Signal / summary */}
      {role.signal && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/50 p-4">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-sm text-foreground leading-relaxed">{role.signal}</p>
        </div>
      )}

      {role.summary && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{role.summary}</p>
        </div>
      )}

      {/* Alignment breakdown */}
      {role.alignment.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Alignment
            </h3>
            <span className="text-xs text-muted-foreground">
              {strongCount}/{totalCount} strong
            </span>
          </div>
          <div className="space-y-2">
            {role.alignment.map((a) => (
              <div
                key={a.criterion}
                className="flex items-start gap-3 rounded-lg border border-border bg-secondary/50 p-3"
              >
                <AlignmentIcon rating={a.rating} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{a.criterion}</p>
                  {a.evidence && (
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                      {a.evidence}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gaps */}
      {role.gaps.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Areas to develop
          </h3>
          <ul className="space-y-1.5">
            {role.gaps.map((gap) => (
              <li
                key={gap}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                {gap}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Prep CTA */}
      <Link
        href={`/prepare?role=${roleId}`}
        className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50/30 p-4 transition-all hover:border-violet-300 hover:shadow-sm dark:border-violet-900/40 dark:bg-violet-950/20 dark:hover:border-violet-800/60"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
          <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Prep Studio</p>
          <p className="text-[11px] text-muted-foreground">
            Practice questions, mock interviews, and rapid fire rounds
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white dark:bg-violet-600">
          Start
        </span>
      </Link>

      {/* Role description - collapsible card */}
      {role.jobDescription && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              About this role
            </h3>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isDescriptionExpanded && "rotate-180"
              )}
            />
          </button>
          <div
            className={cn(
              "px-4 pb-4 transition-all",
              isDescriptionExpanded ? "block" : "hidden"
            )}
          >
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {role.jobDescription}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
