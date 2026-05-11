"use client";

import { Sparkles } from "lucide-react";
import { useAskPanel } from "./ask-ai-panel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface AskAIButtonProps {
  entity: string;
  id?: string;
  view: "list" | "detail";
  className?: string;
  /** Pre-loaded serialized data to send as context (avoids re-fetching) */
  data?: Record<string, unknown>;
}

export function AskAIButton({ entity, id, view, className, data }: AskAIButtonProps) {
  const { openPanel } = useAskPanel();

  return (
    <Button
      variant="unstyled"
      onClick={() => openPanel({ entity, id, view, data })}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition-colors select-none",
        className
      )}
    >
      <Sparkles className="size-3" />
      Ask AI
    </Button>
  );
}
