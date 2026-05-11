import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface EyebrowHeadingProps {
  children: React.ReactNode;
  accent?: "amber" | "muted";
  action?: { label: string; href: string };
  className?: string;
  as?: "h2" | "h3" | "p";
}

const ACCENTS = {
  amber: "text-amber-600",
  muted: "text-muted-foreground",
} as const;

export function EyebrowHeading({
  children,
  accent = "muted",
  action,
  className,
  as: Tag = "h2",
}: EyebrowHeadingProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <Tag
        className={cn(
          "text-[10px] font-bold uppercase tracking-[0.2em]",
          ACCENTS[accent],
        )}
      >
        {children}
      </Tag>
      {action && (
        <Link
          href={action.href}
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium transition-colors",
            accent === "amber"
              ? "text-amber-600 hover:text-amber-700"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {action.label}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
