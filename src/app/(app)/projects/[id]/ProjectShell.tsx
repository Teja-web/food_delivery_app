"use client";

import {
  ChevronLeft,
  FileText,
  GitBranch,
  LayoutDashboard,
  Loader2,
  PencilLine,
  ScrollText,
  Settings,
  Shield,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { saveProjectStandardAction } from "@/actions/project/standards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ArtifactFileType } from "@/db/schema/artifact";
import { cn } from "@/lib/utils";
import type { CockpitTabCounts } from "@/operations/project/cockpit-counts";

import type { CockpitProjectClient } from "./serialize";

interface TabDef {
  slug: string;
  label: string;
  Icon: typeof LayoutDashboard;
  count?: (c: CockpitTabCounts) => number;
}

export interface StageArtifactClient {
  id: string;
  name: string;
  sourceFileName: string;
  title: string;
  body: string;
  type: ArtifactFileType;
}

interface StageArtifactDef {
  name: "requirements.md" | "design.md";
  title: "Project Requirements" | "Project Design";
  projectArtifactKind: "requirements" | "design";
  uploadLabel: string;
  uploadedLabel: string;
}

const STAGE_ARTIFACTS: readonly StageArtifactDef[] = [
  {
    name: "requirements.md",
    title: "Project Requirements",
    projectArtifactKind: "requirements",
    uploadLabel: "Upload Requirements",
    uploadedLabel: "Requirements uploaded",
  },
  {
    name: "design.md",
    title: "Project Design",
    projectArtifactKind: "design",
    uploadLabel: "Upload Design",
    uploadedLabel: "Design uploaded",
  },
];

const FILE_ACCEPT = ".md,.markdown,.txt,.html,.json,text/markdown,text/plain,text/html,application/json";

/**
 * Five-tab project IA per spec section 11.3. One axis: artifact type / activity area.
 * No phase strip -- SDLC progression is observed through artifacts and plan status.
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
  stageArtifacts: StageArtifactClient[];
  children: ReactNode;
}

export function ProjectShell({ project, counts, stageArtifacts, children }: Props) {
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
              {project.slug} - created {new Date(project.createdAt).toLocaleDateString("en-US")}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <StageArtifactControls projectId={project.id} artifacts={stageArtifacts} />
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
      </div>

      <div>{children}</div>
    </div>
  );
}

function StageArtifactControls({
  projectId,
  artifacts,
}: {
  projectId: string;
  artifacts: StageArtifactClient[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<StageArtifactDef | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const byName = useMemo(() => {
    const map = new Map<string, StageArtifactClient>();
    for (const artifact of artifacts) map.set(artifact.name.toLowerCase(), artifact);
    return map;
  }, [artifacts]);

  function existingFor(def: StageArtifactDef): StageArtifactClient | null {
    return byName.get(def.name) ?? null;
  }

  function inferArtifactType(file: File): ArtifactFileType {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".txt") || file.type === "text/plain") return ".txt";
    if (lower.endsWith(".html") || file.type === "text/html") return ".html";
    if (lower.endsWith(".json") || file.type === "application/json") return ".json";
    return ".md";
  }

  async function readArtifactFile(file: File): Promise<{
    body: string;
    type: ArtifactFileType;
    sourceFileName: string;
  }> {
    const lower = file.name.toLowerCase();
    const accepted =
      lower.endsWith(".md") ||
      lower.endsWith(".markdown") ||
      lower.endsWith(".txt") ||
      lower.endsWith(".html") ||
      lower.endsWith(".json") ||
      file.type === "text/markdown" ||
      file.type === "text/plain" ||
      file.type === "text/html" ||
      file.type === "application/json" ||
      file.type === "";
    if (!accepted) throw new Error("Upload a Markdown, text, HTML, or JSON file.");
    const body = await file.text();
    if (!body.trim()) throw new Error("Uploaded file cannot be empty.");
    return {
      body,
      type: inferArtifactType(file),
      sourceFileName: file.name,
    };
  }

  function saveArtifact(
    def: StageArtifactDef,
    artifact: { body: string; type?: ArtifactFileType; sourceFileName?: string },
  ) {
    const existing = existingFor(def);
    if (!artifact.body.trim()) {
      setError("File content is required.");
      return;
    }

    startTransition(async () => {
      const result = await saveProjectStandardAction({
        id: existing?.id,
        projectId,
        title: def.title,
        sourceFileName: artifact.sourceFileName ?? existing?.sourceFileName ?? def.name,
        body: artifact.body,
        type: artifact.type ?? existing?.type ?? ".md",
        category: "project-exclusive",
        projectArtifactKind: def.projectArtifactKind,
      });
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setError(null);
      setEditing(null);
      toast.success(`${def.title} saved.`);
      router.refresh();
    });
  }

  async function uploadArtifact(def: StageArtifactDef, file: File | undefined) {
    if (!file || existingFor(def)) return;
    try {
      const artifact = await readArtifactFile(file);
      saveArtifact(def, artifact);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not upload artifact.";
      setError(message);
      toast.error(message);
    }
  }

  function openEditor(def: StageArtifactDef) {
    const existing = existingFor(def);
    if (!existing) return;
    setEditing(def);
    setDraftBody(existing.body);
    setError(null);
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {STAGE_ARTIFACTS.map((def) => {
        const existing = existingFor(def);
        const inputId = `stage-artifact-${def.name}`;
        return (
          <div key={def.name} className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={existing ? "soft" : "outline"}
              disabled={Boolean(existing) || pending}
              asChild={!existing}
            >
              {existing ? (
                <span>{def.uploadedLabel}</span>
              ) : (
                <label htmlFor={inputId} className="cursor-pointer">
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  {def.uploadLabel}
                </label>
              )}
            </Button>
            {!existing ? (
              <Input
                id={inputId}
                type="file"
                accept={FILE_ACCEPT}
                className="sr-only"
                disabled={pending}
                onChange={(event) => {
                  void uploadArtifact(def, event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => openEditor(def)}
                disabled={pending}
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden />
                Edit
              </Button>
            )}
          </div>
        );
      })}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit {editing?.title}</DialogTitle>
            <DialogDescription>
              Saving updates the existing {editing?.name} project artifact. No duplicate artifact is created.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="stage-artifact-body">Content</Label>
            <Textarea
              id="stage-artifact-body"
              value={draftBody}
              onChange={(event) => setDraftBody(event.target.value)}
              rows={16}
              className="font-mono text-xs"
            />
            {error ? (
              <div className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => editing && saveArtifact(editing, { body: draftBody })}
              disabled={pending}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
