import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { AutonomyPill } from "@/components/trust/AutonomyPill";
import { cn } from "@/lib/utils";

import type { AutonomyEventClient } from "./serialize";

export function RecentEventsBanner({ events }: { events: AutonomyEventClient[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border bg-card/30 px-6 py-4 text-sm text-muted-foreground">
        No autonomy events in the last 14 days. Skills are holding steady.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Recent events (last 14 days)
      </div>
      <ul className="space-y-1.5">
        {events.map((e) => {
          const isPromotion = e.kind === "promotion";
          const Icon = isPromotion ? ArrowUpRight : ArrowDownRight;
          return (
            <li
              key={`${e.skillId}-${e.occurredAt}`}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-4 py-3",
                isPromotion
                  ? "border-trend-up/30 bg-trend-up/5"
                  : "border-trend-down/40 bg-trend-down/5",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  isPromotion ? "text-trend-up" : "text-trend-down",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-[11px] uppercase tracking-wide">
                    {isPromotion ? "Promoted" : "Demoted"}
                  </span>
                  <Link
                    href={`/skills/${e.skillId}`}
                    className="font-medium hover:underline"
                  >
                    {e.skillName}
                  </Link>
                  <span className="text-muted-foreground">to</span>
                  <AutonomyPill level={e.toLabel} />
                  <span className="text-[11px] text-muted-foreground">· {e.ageLabel}</span>
                </div>
                {e.reason ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">{e.reason}</div>
                ) : null}
              </div>
              {isPromotion ? (
                <Link
                  href={`/skills/${e.skillId}`}
                  className="shrink-0 text-xs text-trend-up hover:underline"
                >
                  View receipts →
                </Link>
              ) : (
                <Link
                  href={`/skills/${e.skillId}`}
                  className="shrink-0 text-xs text-trend-down hover:underline"
                >
                  View incident →
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
