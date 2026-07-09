"use client";

import { Kanban, LayoutList, Network } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const PLAN_VIEW_KINDS = ["table", "tree", "kanban"] as const;
export type PlanViewKind = (typeof PLAN_VIEW_KINDS)[number];

export function isPlanViewKind(value: string | null | undefined): value is PlanViewKind {
  return value === "table" || value === "tree" || value === "kanban";
}

export function ViewToggle({
  value,
  onChange,
}: {
  value: PlanViewKind;
  onChange: (next: PlanViewKind) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        if (isPlanViewKind(v)) onChange(v);
      }}
      variant="outline"
      size="sm"
      aria-label="View"
    >
      <ToggleGroupItem value="table" aria-label="Table view" className="gap-1.5 px-2.5">
        <LayoutList className="h-3.5 w-3.5" aria-hidden />
        <span className="font-mono text-[10px] uppercase tracking-[0.08em]">Table</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="tree" aria-label="Tree view" className="gap-1.5 px-2.5">
        <Network className="h-3.5 w-3.5" aria-hidden />
        <span className="font-mono text-[10px] uppercase tracking-[0.08em]">Tree</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="kanban" aria-label="Kanban view" className="gap-1.5 px-2.5">
        <Kanban className="h-3.5 w-3.5" aria-hidden />
        <span className="font-mono text-[10px] uppercase tracking-[0.08em]">Kanban</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
