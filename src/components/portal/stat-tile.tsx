import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatTileProps {
  value: number | string;
  label: string;
  caption?: string;
  icon?: LucideIcon;
  iconAnimate?: "pulse" | "spin";
  iconClassName?: string;
  trend?: { direction: "up" | "down" | "flat"; delta?: string };
  href?: string;
  className?: string;
}

const TREND = {
  up: { icon: ArrowUpRight, color: "text-emerald-600" },
  down: { icon: ArrowDownRight, color: "text-rose-600" },
  flat: { icon: Minus, color: "text-muted-foreground" },
} as const;

export function StatTile({
  value,
  label,
  caption,
  icon: Icon,
  iconAnimate,
  iconClassName,
  trend,
  href,
  className,
}: StatTileProps) {
  const TrendIcon = trend ? TREND[trend.direction].icon : null;
  const trendColor = trend ? TREND[trend.direction].color : "";

  const inner = (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 transition-colors",
        href && "hover:border-amber-200 hover:bg-amber-50/20",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-metric text-2xl text-foreground">{value}</p>
        {Icon && (
          <Icon
            className={cn(
              "h-4 w-4 text-muted-foreground",
              iconAnimate === "pulse" && "animate-pulse",
              iconAnimate === "spin" && "animate-spin",
              iconClassName,
            )}
          />
        )}
      </div>
      <p className="mt-1 text-xs font-medium text-foreground">{label}</p>
      {caption && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{caption}</p>
      )}
      {trend && TrendIcon && (
        <div className={cn("mt-1 flex items-center gap-0.5 text-[10px] font-medium", trendColor)}>
          <TrendIcon className="h-3 w-3" />
          {trend.delta && <span>{trend.delta}</span>}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
