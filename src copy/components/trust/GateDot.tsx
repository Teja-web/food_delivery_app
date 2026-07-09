import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export type GateState = "pending" | "passed" | "failed" | "skipped";

const dotVariants = cva("inline-block h-2 w-2 rounded-full", {
  variants: {
    state: {
      pending: "bg-state-pending",
      passed: "bg-state-passed",
      failed: "bg-state-failed",
      skipped: "bg-state-skipped/60",
    },
  },
  defaultVariants: { state: "pending" },
});

type Props = React.ComponentProps<"span"> &
  VariantProps<typeof dotVariants> & {
    state: GateState;
  };

export function GateDot({ state, className, ...rest }: Props) {
  return (
    <span
      aria-label={`Gate state: ${state}`}
      className={cn(dotVariants({ state }), className)}
      {...rest}
    />
  );
}
