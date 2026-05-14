"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ProjectFilterOption {
  id: string;
  name: string;
}

/**
 * Project selector for the skills ledger — switches autonomy/stats fetches
 * between org-wide (legacy) and per-project. Updates `?projectId=` in the
 * URL so the page is server-rendered with the filter applied.
 */
export function ProjectFilter({
  projects,
  activeProjectId,
}: {
  projects: ProjectFilterOption[];
  activeProjectId: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const active = activeProjectId
    ? projects.find((p) => p.id === activeProjectId) ?? null
    : null;

  const pick = (projectId: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (projectId) next.set("projectId", projectId);
    else next.delete("projectId");
    startTransition(() => {
      router.push(`/skills${next.size ? `?${next.toString()}` : ""}`);
      setOpen(false);
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-[12rem] justify-between"
        >
          <span className="truncate">
            {active ? active.name : "All projects (org-wide)"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1">
        <button
          type="button"
          onClick={() => pick(null)}
          className={cn(
            "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted",
            !activeProjectId && "bg-muted/60",
          )}
        >
          <span>
            <span className="font-medium">All projects</span>
            <span className="ml-1 text-xs text-muted-foreground">(org-wide rows)</span>
          </span>
          {!activeProjectId ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
        </button>
        {projects.length > 0 ? (
          <div className="my-1 h-px bg-border" />
        ) : null}
        <div className="max-h-72 overflow-y-auto">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted",
                p.id === activeProjectId && "bg-muted/60",
              )}
            >
              <span className="truncate">{p.name}</span>
              {p.id === activeProjectId ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
