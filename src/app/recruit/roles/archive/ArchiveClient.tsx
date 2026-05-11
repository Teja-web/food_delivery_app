"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompensationRange } from "@/lib/format-compensation";
import type { SerializedListRole } from "../serialize";

function daysOpen(createdAt: string) {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function healthDot(health: string | null) {
  switch (health) {
    case "filled": return "bg-emerald-500";
    case "cancelled": return "bg-stone-400";
    case "stalled": return "bg-red-500";
    default: return "bg-muted-foreground";
  }
}

function healthLabel(health: string | null) {
  switch (health) {
    case "filled": return "Filled";
    case "cancelled": return "Cancelled";
    case "stalled": return "Stalled";
    default: return health || "Closed";
  }
}

function ArchivedRow({ role }: { role: SerializedListRole }) {
  const days = daysOpen(role.createdAt);
  const meta = [
    role.team || "No team",
    role.location || "No location",
    role.compensation ? formatCompensationRange(role.compensation) : null,
    role.hiringManagerName ? `HM: ${role.hiringManagerName}` : null,
    role.recruiterName ? role.recruiterName : null,
    role.closedDate
      ? `Closed ${new Date(role.closedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : null,
  ].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/recruit/roles/${role.id}`}
      className="group block border-b border-border/60 last:border-b-0 px-5 py-3 hover:bg-secondary/30 transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", healthDot(role.health))} title={healthLabel(role.health)} />
            <span className="text-sm font-semibold text-muted-foreground truncate">{role.title}</span>
            <span className="rounded-full border border-border px-1.5 py-0 text-[9px] font-medium text-muted-foreground">
              {healthLabel(role.health)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">{meta}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {days}d to {role.outcome === "hired" ? "fill" : "close"}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
        </div>
      </div>
    </Link>
  );
}

export default function ArchiveClient({ roles, total }: { roles: SerializedListRole[]; total: number }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="space-y-5">
          <Link
            href="/recruit/roles"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Open roles
          </Link>

          <div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Briefcase className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Archive</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
              {total} closed
            </h1>
          </div>

          {roles.length > 0 ? (
            <div className="border-t border-border">
              {roles.map((role) => (
                <ArchivedRow key={role.id} role={role} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
              <Briefcase className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs font-semibold text-foreground">No closed roles yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
