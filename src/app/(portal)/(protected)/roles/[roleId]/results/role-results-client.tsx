"use client";

import {
  Brain,
  TrendingUp,
} from "lucide-react";

interface PrepSession {
  id: string;
  type: string;
  createdAt: string;
  score: number | null;
  summary: string | null;
}

export function RoleResultsClient({
  prepSessions,
}: {
  prepSessions: PrepSession[];
}) {
  const hasAny = prepSessions.length > 0;

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
        <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium text-foreground">No results yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Complete practice sessions to see your scores here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Prep session scores */}
      {prepSessions.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Practice scores
            </h2>
          </div>
          <div className="space-y-2">
            {prepSessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <Brain className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground capitalize">
                    {s.type.replace(/_/g, " ")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(s.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                {s.score != null && (
                  <span
                    className={`text-lg font-bold tabular-nums ${
                      s.score >= 80
                        ? "text-emerald-600"
                        : s.score >= 60
                          ? "text-amber-600"
                          : "text-stone-400"
                    }`}
                  >
                    {s.score}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
