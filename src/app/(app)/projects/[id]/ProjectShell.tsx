"use client";

import {
  Activity,
  ChevronLeft,
  ChevronsRight,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Files,
  GitBranch,
  LayoutDashboard,
  Milestone,
  Plus,
  Rocket,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CockpitTabCounts } from "@/operations/project/cockpit-counts";

import { ConnectCursorModal } from "./ConnectCursorModal";
import type { CockpitProjectClient } from "./serialize";

const PHASE_LABEL: Record<CockpitProjectClient["phase"], string> = {
  requirements: "REQUIREMENTS",
  design: "DESIGN",
  development: "DEVELOPMENT",
  testing: "TESTING",
  cicd: "CI/CD",
  monitoring: "MONITORING",
};

interface TabDef {
  slug: string;
  label: string;
  Icon: typeof LayoutDashboard;
  count?: (c: CockpitTabCounts) => number;
}

const TABS: readonly TabDef[] = [
  { slug: "overview", label: "Overview", Icon: LayoutDashboard },
  { slug: "requirements", label: "Requirements", Icon: ClipboardCheck, count: (c) => c.requirements },
  { slug: "work-items", label: "Work items", Icon: GitBranch, count: (c) => c.workItems },
  { slug: "test-cases", label: "Test plans", Icon: Activity, count: (c) => c.tests },
  { slug: "adrs", label: "ADRs", Icon: ScrollText, count: (c) => c.adrs },
  { slug: "documents", label: "Documents", Icon: FileText },
  { slug: "rules-skills", label: "Rules & skills", Icon: Shield, count: (c) => c.rulesAndSkills },
  { slug: "phases", label: "Phases", Icon: Milestone },
  { slug: "cicd", label: "CI/CD", Icon: Rocket, count: (c) => c.deployments },
  { slug: "trust", label: "Trust", Icon: Sparkles, count: (c) => c.trustOutcomes },
  { slug: "all-plans", label: "All plans", Icon: Files, count: (c) => c.plansTotal },
  { slug: "settings", label: "Settings", Icon: Settings },
];

interface Props {
  project: CockpitProjectClient;
  apiKey: { prefix: string; plaintext: string | null; isNew: boolean };
  counts: CockpitTabCounts;
  children: ReactNode;
}

export function ProjectShell({ project, apiKey, counts, children }: Props) {
  const pathname = usePathname();
  const [cursorOpen, setCursorOpen] = useState(false);

  const activeSlug = (() => {
    const prefix = `/projects/${project.id}/`;
    if (!pathname?.startsWith(prefix)) return "overview";
    const rest = pathname.slice(prefix.length);
    const seg = rest.split("/")[0];
    return TABS.find((t) => t.slug === seg)?.slug ?? "overview";
  })();

  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const [tabsHasOverflow, setTabsHasOverflow] = useState(false);

  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const update = () => {
      const overflow = el.scrollWidth - el.clientWidth > 1;
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
      setTabsHasOverflow(overflow && !atEnd);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const scrollTabsRight = () => {
    tabsScrollRef.current?.scrollBy({ left: 240, behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Portfolio
      </Link>

      <header className="flex items-start justify-between gap-6 border-b pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{project.name}</h1>
            <Badge
              variant="outline"
              className="border-state-pending/40 px-1.5 py-0 font-mono text-[10px] uppercase tracking-wide text-state-pending"
            >
              {PHASE_LABEL[project.phase]}
            </Badge>
          </div>
          {project.description ? (
            <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{project.description}</p>
          ) : null}
          <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
            {project.slug} · created {new Date(project.createdAt).toLocaleDateString()}
            {project.repoUrl ? (
              <>
                <span className="mx-2 opacity-40">·</span>
                <a
                  href={project.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  repo <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </>
            ) : null}
            {project.jiraProjectKey ? (
              <>
                <span className="mx-2 opacity-40">·</span>
                <span>Jira {project.jiraProjectKey}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCursorOpen(true)}>
            Open in Cursor
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/plans/new?projectId=${project.id}`}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> New plan
            </Link>
          </Button>
        </div>
      </header>

      <div className="space-y-6">
        <div className="relative border-b">
          <div
            ref={tabsScrollRef}
            className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <nav
              aria-label="Project tabs"
              className="flex h-auto w-max items-center justify-start gap-1 pr-10 [&>*]:shrink-0"
            >
              {TABS.map(({ slug, label, Icon, count }) => {
                const isActive = slug === activeSlug;
                const n = count?.(counts);
                return (
                  <Link
                    key={slug}
                    href={`/projects/${project.id}/${slug}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border-b-2 border-transparent px-3 py-2 text-sm transition-colors",
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
          {tabsHasOverflow && (
            <button
              type="button"
              onClick={scrollTabsRight}
              aria-label="Scroll tabs right"
              className="pointer-events-auto absolute inset-y-0 right-0 flex items-center gap-0.5 bg-gradient-to-l from-background via-background/95 to-transparent pl-8 pr-2 text-foreground/60 transition-colors hover:text-foreground"
            >
              <ChevronsRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        <div>{children}</div>
      </div>

      <ConnectCursorModal
        open={cursorOpen}
        onOpenChange={setCursorOpen}
        projectSlug={project.slug}
        apiKeyPrefix={apiKey.prefix}
        apiKeyPlaintext={apiKey.plaintext}
        isNewKey={apiKey.isNew}
      />
    </div>
  );
}
