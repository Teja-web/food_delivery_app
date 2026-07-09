"use client";

import { Sparkline, type SparkDirection } from "@/components/viz/Sparkline";
import { cn } from "@/lib/utils";

export type SmallMultiplesCell = {
  points: number[];
  value?: string;
  direction?: SparkDirection;
};

type Props = {
  rows: { key: string; label: string }[];
  cols: { key: string; label: string }[];
  data: Record<string, Record<string, SmallMultiplesCell | undefined>>;
  className?: string;
};

export function SmallMultiples({ rows, cols, data, className }: Props) {
  return (
    <div
      className={cn("overflow-x-auto rounded-md border border-border/50", className)}
    >
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50 bg-muted/30">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground" />
            {cols.map((c) => (
              <th
                key={c.key}
                className="px-3 py-2 text-left font-medium text-muted-foreground"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/30 last:border-0">
              <th
                scope="row"
                className="px-3 py-2 text-left text-sm font-medium text-foreground/90"
              >
                {r.label}
              </th>
              {cols.map((c) => {
                const cell = data[r.key]?.[c.key];
                return (
                  <td key={c.key} className="px-3 py-2 align-middle">
                    {cell ? (
                      <div className="flex items-center gap-2">
                        <Sparkline
                          points={cell.points}
                          direction={cell.direction ?? "flat"}
                          width={56}
                          height={16}
                        />
                        {cell.value ? (
                          <span className="font-mono text-[11px] text-foreground/80 tabular-nums">
                            {cell.value}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
