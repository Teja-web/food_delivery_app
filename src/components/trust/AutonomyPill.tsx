import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AutonomyLevel = "OBSERVE" | "PROPOSE" | "MERGE" | "LEAD";

const autonomyVariants = cva(
  "border bg-transparent px-1.5 py-0 text-[10px] font-medium uppercase tracking-[0.06em]",
  {
    variants: {
      level: {
        OBSERVE: "border-autonomy-intern/40 bg-autonomy-intern/10 text-autonomy-intern",
        PROPOSE: "border-autonomy-junior/40 bg-autonomy-junior/10 text-autonomy-junior",
        MERGE: "border-autonomy-senior/40 bg-autonomy-senior/10 text-autonomy-senior",
        LEAD: "border-autonomy-principal/40 bg-autonomy-principal/10 text-autonomy-principal",
      },
    },
    defaultVariants: { level: "PROPOSE" },
  },
);

const LABEL: Record<AutonomyLevel, string> = {
  OBSERVE: "Observe",
  PROPOSE: "Propose",
  MERGE: "Merge",
  LEAD: "Lead",
};

/**
 * Maps the lowercase `LevelName` (from `autonomy-constants.ts`) to the pill's
 * uppercase variant key. The autonomy CSS tokens still carry their original
 * names (`autonomy-intern`/`junior`/`senior`/`principal`) so we don't have to
 * re-skin the theme in the same change — only the public display labels
 * change here.
 */
export const AUTONOMY_LABELS: Record<"observe" | "propose" | "merge" | "lead", AutonomyLevel> = {
  observe: "OBSERVE",
  propose: "PROPOSE",
  merge: "MERGE",
  lead: "LEAD",
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
