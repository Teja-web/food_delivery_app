import { Bot } from "lucide-react";
import type { ProvenanceSummary } from "@/domain/provenance/summarize";

/**
 * Provenance summary — counts and ratios only.
 *
 * Renders the output of `summarizeProvenance()`. Never displays code or
 * prompt bodies; coznt is not a Git host. The per-line diff annotation
 * lives in the GitHub/GitLab PR view via the comment bot (M-C).
 */
export function SummaryPanel({
  summary,
  skillNames,
  className,
}: {
  summary: ProvenanceSummary;
  /** Optional skill-id → display-name lookup. Falls back to the id when missing. */
  skillNames?: Record<string, string>;
  className?: string;
}) {
  if (summary.total === 0) {
    return (
      <div className={`text-sm text-muted-foreground ${className ?? ""}`}>No entities to summarize.</div>
    );
  }

  const aiPct = Math.round(summary.aiAuthoredRatio * 100);
  const modelEntries = Object.entries(summary.modelMix).sort((a, b) => b[1] - a[1]);
  const skillEntries = Object.entries(summary.skillMix).sort((a, b) => b[1] - a[1]);
  const autonomyEntries = Object.entries(summary.autonomyDistribution)
    .map(([k, v]) => [Number(k), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className ?? ""}`}>
      <header className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
          Provenance
        </h3>
        <Bot className="h-4 w-4 text-muted-foreground" aria-hidden />
      </header>

      <div className="space-y-3">
        <Stat label="AI-authored" value={`${summary.aiAuthored} / ${summary.total} (${aiPct}%)`} />

        {modelEntries.length > 0 && (
          <Section title="By model">
            {modelEntries.map(([model, n]) => (
              <Row key={model} k={model} v={n} />
            ))}
          </Section>
        )}

        {skillEntries.length > 0 && (
          <Section title="By skill">
            {skillEntries.map(([id, n]) => (
              <Row key={id} k={skillNames?.[id] ?? id} v={n} />
            ))}
          </Section>
        )}

        {autonomyEntries.length > 0 && (
          <Section title="Autonomy at generation">
            {autonomyEntries.map(([level, n]) => (
              <Row key={level} k={`level ${level}`} v={n} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="truncate text-foreground">{k}</span>
      <span className="text-muted-foreground tabular-nums">{v}</span>
    </div>
  );
}
