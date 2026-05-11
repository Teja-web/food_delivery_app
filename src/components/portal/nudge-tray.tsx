"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Flame,
  MessageCircle,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface NudgeTrayItem {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  priority?: number;
}

interface NudgeTrayProps {
  nudges: NudgeTrayItem[];
  onDismiss: (id: string) => Promise<void> | void;
  className?: string;
}

const NUDGE_ICONS: Record<string, typeof Brain> = {
  interview_prep: Brain,
  streak_broken: Flame,
  evaluation_ready: Sparkles,
  growth_improved: TrendingUp,
  assessment_available: MessageCircle,
};

const NUDGE_COLORS: Record<string, { border: string; bg: string; icon: string }> = {
  interview_prep: { border: "border-amber-200", bg: "bg-amber-50/40", icon: "text-amber-600" },
  streak_broken: { border: "border-orange-200", bg: "bg-orange-50/40", icon: "text-orange-500" },
  evaluation_ready: { border: "border-emerald-200", bg: "bg-emerald-50/40", icon: "text-emerald-600" },
  growth_improved: { border: "border-blue-200", bg: "bg-blue-50/40", icon: "text-blue-600" },
  assessment_available: { border: "border-violet-200", bg: "bg-violet-50/40", icon: "text-violet-600" },
};

const FALLBACK_COLORS = NUDGE_COLORS.evaluation_ready!;

export function NudgeTray({ nudges, onDismiss, className }: NudgeTrayProps) {
  const [locallyDismissed, setLocallyDismissed] = useState<Set<string>>(new Set());
  const visible = nudges.filter((n) => !locallyDismissed.has(n.id));
  if (visible.length === 0) return null;

  async function handleDismiss(id: string) {
    setLocallyDismissed((prev) => new Set(prev).add(id));
    try {
      await onDismiss(id);
    } catch {
      // Optimistic dismissal — server failure leaves the local state dismissed.
      // Next page load reflects the real server state.
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      {visible.map((nudge) => (
        <NudgeCard key={nudge.id} nudge={nudge} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}

function NudgeCard({
  nudge,
  onDismiss,
}: {
  nudge: NudgeTrayItem;
  onDismiss: (id: string) => Promise<void> | void;
}) {
  const Icon = NUDGE_ICONS[nudge.type] ?? Sparkles;
  const colors = NUDGE_COLORS[nudge.type] ?? FALLBACK_COLORS;

  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4", colors.border, colors.bg)}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", colors.icon)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{nudge.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{nudge.message}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {nudge.actionUrl && (
          <Link
            href={nudge.actionUrl}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/80 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-white"
          >
            {nudge.actionLabel ?? "Go"}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onDismiss(nudge.id)}
          className="rounded-md text-muted-foreground/50 transition-colors hover:bg-white/50 hover:text-muted-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
