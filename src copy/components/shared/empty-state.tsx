import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateCta =
  | { label: string; href: string }
  | { label: string; onClick: () => void };

interface EmptyStateProps {
  icon: LucideIcon;
  headline: string;
  description?: string;
  cta?: EmptyStateCta;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { wrap: "p-6", icon: "h-6 w-6", headline: "text-sm", description: "text-xs" },
  md: { wrap: "p-8", icon: "h-8 w-8", headline: "text-base", description: "text-sm" },
  lg: { wrap: "p-10", icon: "h-10 w-10", headline: "text-lg", description: "text-sm" },
} as const;

export function EmptyState({
  icon: Icon,
  headline,
  description,
  cta,
  size = "md",
  className,
}: EmptyStateProps) {
  const s = SIZES[size];
  const ctaClasses =
    "inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity active:scale-[0.97]";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-stone-200 bg-card/50",
        s.wrap,
        className,
      )}
    >
      <Icon className={cn(s.icon, "text-muted-foreground/60")} />
      <p className={cn("mt-3 font-semibold text-foreground", s.headline)}>{headline}</p>
      {description && (
        <p className={cn("mt-1 max-w-md text-muted-foreground", s.description)}>{description}</p>
      )}
      {cta && (
        <div className="mt-4">
          {"href" in cta ? (
            <Link href={cta.href} className={ctaClasses}>
              {cta.label}
            </Link>
          ) : (
            <button type="button" onClick={cta.onClick} className={ctaClasses}>
              {cta.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
