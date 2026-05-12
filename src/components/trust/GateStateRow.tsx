import { AttributionChip } from "@/components/trust/AttributionChip";
import { GateDot, type GateState } from "@/components/trust/GateDot";
import { cn } from "@/lib/utils";

export type GateRow = {
  name: string;
  state: GateState;
  unmetCriterion?: string;
  assignee?: string;
  ageLabel?: string;
  attribution?: { id: string; href?: string };
};

export function GateStateRow({ gate, className }: { gate: GateRow; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border border-border/40 bg-muted/20 px-2.5 py-1.5",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <GateDot state={gate.state} />
        <span className="truncate text-sm font-medium">{gate.name}</span>
        {gate.unmetCriterion ? (
          <span className="truncate text-xs text-muted-foreground">
            · {gate.unmetCriterion}
            {gate.assignee ? <span className="ml-1 text-foreground/80">@{gate.assignee}</span> : null}
            {gate.ageLabel ? <span className="ml-1 opacity-60">({gate.ageLabel})</span> : null}
          </span>
        ) : null}
      </div>
      {gate.attribution ? (
        <AttributionChip id={gate.attribution.id} href={gate.attribution.href} />
      ) : null}
    </div>
  );
}
