"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils";

export type SparkDirection = "up" | "down" | "flat";

const COLOR_VAR: Record<SparkDirection, string> = {
  up: "var(--trend-up)",
  down: "var(--trend-down)",
  flat: "var(--trend-flat)",
};

type Props = {
  points: number[];
  direction?: SparkDirection;
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
};

export function Sparkline({
  points,
  direction = "flat",
  width = 64,
  height = 18,
  strokeWidth = 1.5,
  className,
}: Props) {
  if (!points.length) {
    return (
      <span
        aria-label="No data"
        className={cn("inline-block bg-muted/40", className)}
        style={{ width, height }}
      />
    );
  }
  const data = points.map((y, x) => ({ x, y }));
  return (
    <div
      className={cn("inline-block leading-none align-middle", className)}
      style={{ width, height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <Line
            type="monotone"
            dataKey="y"
            stroke={COLOR_VAR[direction]}
            strokeWidth={strokeWidth}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
