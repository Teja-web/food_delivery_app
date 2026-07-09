import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export type StatusLevel = "healthy" | "warning" | "danger" | "neutral";

const dotVariants = cva("inline-block h-2 w-2 rounded-full", {
  variants: {
    status: {
      healthy: "bg-trend-up",
      warning: "bg-state-pending",
      danger: "bg-state-failed",
      neutral: "bg-muted-foreground/60",
    },
  },
  defaultVariants: { status: "neutral" },
});

type Props = React.ComponentProps<"span"> &
  VariantProps<typeof dotVariants> & {
    status: StatusLevel;
  };

export function StatusDot({ status, className, ...rest }: Props) {
  return (
    <span
      aria-label={`Status: ${status}`}
      className={cn(dotVariants({ status }), className)}
      {...rest}
    />
  );
}
