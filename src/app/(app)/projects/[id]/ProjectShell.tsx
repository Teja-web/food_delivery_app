"use client";

import {
  ChevronLeft,
  FileText,
  GitBranch,
  LayoutDashboard,
  ScrollText,
  Settings,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CockpitTabCounts } from "@/operations/project/cockpit-counts";

import type { CockpitProjectClient } from "./serialize";

interface TabDef {
  slug: string;
  label: string;
  Icon: typeof LayoutDashboard;
  count?: (c: CockpitTabCounts) => number;
}

/**
 * Five-tab project IA per spec §11.3. One axis: artifact type / activity area.
 * No phase strip — SDLC progression is observed through plan-artifact status,
 * not project state.
 */
const TABS: readonly TabDef[] = [
  { slug: "overview", label: "Overview", Icon: LayoutDashboard },
  { slug: "standards", label: "Standards", Icon: FileText },
  { slug: "plans", label: "Plans", Icon: ScrollText, count: (c) => c.plansTotal },
  { slug: "work-items", label: "Work items", Icon: GitBranch, count: (c) => c.workItems },
  { slug: "governance", label: "Governance", Icon: Shield, count: (c) => c.trustOutcomes },
  { slug: "settings", label: "Settings", Icon: Settings },
];

interface Props {
  project: CockpitProjectClient;
  counts: CockpitTabCounts;
  children: ReactNode;
}

export function ProjectShell({ project, counts, children }: Props) {
  const pathname = usePathname();

  const activeSlug = (() => {
    const prefix = `/projects/${project.id}/`;
    if (!pathname?.startsWith(prefix)) return "overview";
    const rest = pathname.slice(prefix.length);
    const seg = rest.split("/")[0];
    return TABS.find((t) => t.slug === seg)?.slug ?? "overview";
  })();

  return (
    <div className="space-y-4">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Projects
      </Link>

      {/* Single header band: title + metadata (left), tabs (right), shared bottom border */}
      <div className="border-b">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {project.name}
              </h1>
              <Badge
                variant="outline"
                className="px-1.5 py-0 font-mono text-[10px] uppercase tracking-wide"
              >
                {project.status}
              </Badge>
            </div>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {project.slug} · created {new Date(project.createdAt).toLocaleDateString("en-US")}
            </p>
          </div>

          <nav
            aria-label="Project tabs"
            className="flex h-auto items-end justify-end gap-1"
          >
            {TABS.map(({ slug, label, Icon, count }) => {
              const isActive = slug === activeSlug;
              const n = count?.(counts);
              return (
                <Link
                  key={slug}
                  href={`/projects/${project.id}/${slug}`}
                  className={cn(
                    "-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "border-foreground text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
                  {n !== undefined && n > 0 ? (
                    <span className="ml-0.5 font-mono text-[10px] opacity-70">{n}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div>{children}</div>
    </div>
  );
}
