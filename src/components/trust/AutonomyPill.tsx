import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AutonomyLevel = "INTERN" | "JUNIOR" | "SENIOR" | "PRINCIPAL";

const autonomyVariants = cva(
  "border bg-transparent px-1.5 py-0 text-[10px] font-medium uppercase tracking-[0.06em]",
  {
    variants: {
      level: {
        INTERN: "border-autonomy-intern/40 bg-autonomy-intern/10 text-autonomy-intern",
        JUNIOR: "border-autonomy-junior/40 bg-autonomy-junior/10 text-autonomy-junior",
        SENIOR: "border-autonomy-senior/40 bg-autonomy-senior/10 text-autonomy-senior",
        PRINCIPAL: "border-autonomy-principal/40 bg-autonomy-principal/10 text-autonomy-principal",
      },
    },
    defaultVariants: { level: "JUNIOR" },
  },
);

const LABEL: Record<AutonomyLevel, string> = {
  INTERN: "Intern",
  JUNIOR: "Junior",
  SENIOR: "Senior",
  PRINCIPAL: "Principal",
};

/** Maps the lowercase `LevelName` used in the autonomy operations to the pill's uppercase variant key. */
export const AUTONOMY_LABELS: Record<"intern" | "junior" | "senior" | "principal", AutonomyLevel> = {
  intern: "INTERN",
  junior: "JUNIOR",
  senior: "SENIOR",
  principal: "PRINCIPAL",
};

type Props = Omit<ComponentProps<typeof Badge>, "variant"> &
  VariantProps<typeof autonomyVariants> & {
    level: AutonomyLevel;
  };

export function AutonomyPill({ level, className, children, ...rest }: Props) {
  return (
    <Badge variant="outline" className={cn(autonomyVariants({ level }), className)} {...rest}>
      {children ?? LABEL[level]}
    </Badge>
  );
}
