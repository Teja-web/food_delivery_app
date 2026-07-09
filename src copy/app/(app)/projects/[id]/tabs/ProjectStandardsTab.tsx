"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Eye, FileText, Loader2, PencilLine, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  deleteProjectStandardAction,
  reviewProjectStandardAction,
  saveProjectStandardAction,
} from "@/actions/project/standards";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ArtifactFileType,
  ProjectArtifactKind,
  ProjectArtifactStatus,
} from "@/db/schema/artifact";

type RequiredKey = "coding_standards" | "brand_guidelines" | "architecture_principles";

export interface ProjectStandardItem {
  id: string;
  title: string;
  body: string;
  type: ArtifactFileType;
  category: string | null;
  requiredKey: RequiredKey | null;
  projectArtifactKind: ProjectArtifactKind | null;
  sourceFileName: string;
  sourceOrganizationArtifactId: string | null;
  hash: string;
  updatedAt: string;
  createdVia: "MCP" | "upload";
  status: ProjectArtifactStatus;
}

interface Draft {
  title: string;
  body: string;
  type: ArtifactFileType;
  sourceFileName: string;
}

const FILE_ACCEPT = ".md,.markdown,.txt,.html,.json,text/markdown,text/plain,text/html,application/json";

const REQUIRED_LABELS: Record<RequiredKey, string> = {
  coding_standards: "Coding Standards",
  brand_guidelines: "Brand Guidelines",
  architecture_principles: "Architecture Principles",
};

function emptyDraft(): Draft {
  return {
    title: "",
    body: "",
    type: ".md",
    sourceFileName: "",
  };
}

function draftFromItem(item: ProjectStandardItem): Draft {
  return {
    title: item.title,
    body: item.body,
    type: item.type,
    sourceFileName: item.sourceFileName,
  };
}

function inferType(fileName: string): ArtifactFileType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".txt")) return ".txt";
  if (lower.endsWith(".html")) return ".html";
  if (lower.endsWith(".json")) return ".json";
  return ".md";
}

function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isAcceptedFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".html") ||
    lower.endsWith(".json") ||
    file.type === "text/plain" ||
    file.type === "text/markdown" ||
    file.type === "text/html" ||
    file.type === "application/json" ||
    file.type === ""
  );
}

function byteCount(value: string): string {
  const bytes = new TextEncoder().encode(value).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function shortHash(hash: string): string {
  return hash ? hash.slice(0, 12) : "pending";
}

function kindLabel(item: ProjectStandardItem): string {
  if (item.requiredKey) return REQUIRED_LABELS[item.requiredKey];
  if (item.projectArtifactKind === "requirements") return "Project Requirements";
  if (item.projectArtifactKind === "design") return "Project Design";
  return item.category === "project-exclusive" ? "Project exclusive" : "Additional";
}

function statusLabel(status: ProjectArtifactStatus): string {
  return status === "approved" ? "Approved" : status === "pending" ? "Pending review" : "Rejected";
}

function statusVariant(status: ProjectArtifactStatus): "secondary" | "outline" | "destructive" {
  if (status === "approved") return "secondary";
  if (status === "rejected") return "destructive";
  return "outline";
}

function sourceLabel(item: ProjectStandardItem): string {
  if (item.sourceOrganizationArtifactId) return "Copied from org";
  return item.createdVia === "MCP" ? "Created via MCP" : "Uploaded";
}

function needsReview(item: ProjectStandardItem): boolean {
  return item.status === "pending" && item.createdVia === "MCP" && !item.sourceOrganizationArtifactId;
}

function reviewBody(item: ProjectStandardItem): string {
  if (item.type !== ".json") return item.body;
  try {
    return JSON.stringify(JSON.parse(item.body), null, 2);
  } catch {
    return item.body;
  }
}

export function ProjectStandardsTab({
  projectId,
  standards,
}: {
  projectId: string;
  standards: ProjectStandardItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<ProjectStandardItem | null>(null);
  const [reviewing, setReviewing] = useState<ProjectStandardItem | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [uploadError, setUploadError] = useState<string | null>(null);

  const sourceCounts = useMemo(
    () => ({
      orgCopies: standards.filter((item) => item.sourceOrganizationArtifactId).length,
      projectOnly: standards.filter((item) => !item.sourceOrganizationArtifactId).length,
    }),
    [standards],
  );

  function openEditor(item: ProjectStandardItem) {
    setEditing(item);
    setDraft(draftFromItem(item));
    setUploadError(null);
  }

  function openReview(item: ProjectStandardItem) {
    setReviewing(item);
  }

  async function applyFile(file: File | undefined) {
    if (!file) return;
    if (!isAcceptedFile(file)) {
      setUploadError("Upload a Markdown, text, HTML, or JSON file.");
      return;
    }
    const body = await file.text();
    if (!body.trim()) {
      setUploadError("Uploaded file cannot be empty.");
      return;
    }
    setUploadError(null);
    setDraft((current) => ({
      ...current,
      body,
      type: inferType(file.name),
      sourceFileName: file.name,
      title: current.title.trim() ? current.title : titleFromFileName(file.name),
    }));
  }

  function saveCurrent() {
    if (!editing) return;
    const title = draft.title.trim();
    const sourceFileName = draft.sourceFileName.trim();
    if (!title) {
      setUploadError("Title is required.");
      return;
    }
    if (!sourceFileName) {
      setUploadError("File name is required.");
      return;
    }
    if (!draft.body.trim()) {
      setUploadError("File content is required.");
      return;
    }

    startTransition(async () => {
      const result = await saveProjectStandardAction({
        id: editing.id,
        projectId,
        title,
        sourceFileName,
        body: draft.body,
        type: draft.type,
        category:
          editing.projectArtifactKind === "requirements" ||
          editing.projectArtifactKind === "design"
            ? "project-exclusive"
            : editing.category,
        requiredKey: editing.requiredKey,
        projectArtifactKind: editing.projectArtifactKind,
      });
      if (!result.ok) {
        setUploadError(result.error);
        return;
      }
      toast.success(`${title} saved to project artifacts.`);
      setEditing(null);
      router.refresh();
    });
  }

  function deleteCurrent(item: ProjectStandardItem) {
    startTransition(async () => {
      const result = await deleteProjectStandardAction(projectId, item.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${item.title} removed from project artifacts.`);
      router.refresh();
    });
  }

  function reviewCurrent(item: ProjectStandardItem, status: Exclude<ProjectArtifactStatus, "pending">) {
    startTransition(async () => {
      const result = await reviewProjectStandardAction({
        projectId,
        artifactId: item.id,
        status,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${item.title} ${status === "approved" ? "approved" : "rejected"}.`);
      setReviewing(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Standards</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Project-scoped standards copied from organization defaults or uploaded during
            project creation. Edits here update only this project snapshot.
          </p>
        </div>
        <div className="grid min-w-[240px] grid-cols-2 gap-2">
          <div className="rounded-sm border bg-card px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
              Org copies
            </div>
            <div className="mt-1 text-lg font-semibold">{sourceCounts.orgCopies}</div>
          </div>
          <div className="rounded-sm border bg-card px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
              Project files
            </div>
            <div className="mt-1 text-lg font-semibold">{sourceCounts.projectOnly}</div>
          </div>
        </div>
      </header>

      {standards.length === 0 ? (
        <div className="rounded-sm border border-dashed bg-card p-6 text-sm text-muted-foreground">
          No standards have been copied or uploaded for this project yet.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {standards.map((item) => (
            <article
              key={item.id}
              className="rounded-sm border bg-card p-4 transition-colors hover:border-foreground/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border bg-background">
                      <FileText className="h-4 w-4 text-primary" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">{item.title}</h3>
                        {needsReview(item) ? (
                          <Badge variant="outline">Needs review</Badge>
                        ) : null}
                      </div>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {item.sourceFileName}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{kindLabel(item)}</Badge>
                    <Badge variant={statusVariant(item.status)}>
                      {statusLabel(item.status)}
                    </Badge>
                    <Badge variant="secondary">{sourceLabel(item)}</Badge>
                    <Badge variant="outline">{item.type}</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{byteCount(item.body)}</span>
                    <span aria-hidden>|</span>
                    <span>Updated {new Date(item.updatedAt).toLocaleDateString("en-US")}</span>
                    <span aria-hidden>|</span>
                    <span className="font-mono">sha {shortHash(item.hash)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {needsReview(item) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      onClick={() => openReview(item)}
                      disabled={pending}
                    >
                      <Eye className="h-4 w-4" aria-hidden />
                      Review
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openReview(item)}
                      title={`View ${item.title}`}
                    >
                      <Eye className="h-4 w-4" aria-hidden />
                      View
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => openEditor(item)}
                    title={`Edit ${item.title}`}
                  >
                    <PencilLine className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => deleteCurrent(item)}
                    disabled={pending}
                    title={`Remove ${item.title}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>

              <pre className="mt-4 max-h-32 overflow-auto rounded-sm border bg-background p-3 text-xs leading-5 text-muted-foreground">
                {item.body.slice(0, 900)}
              </pre>
            </article>
          ))}
        </div>
      )}

      <Dialog open={Boolean(reviewing)} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <div className="flex flex-wrap items-start gap-3 pr-8">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border bg-background">
                <FileText className="h-4 w-4 text-primary" aria-hidden />
              </span>
              <div className="min-w-0">
                <DialogTitle className="truncate">{reviewing?.title}</DialogTitle>
                <DialogDescription className="mt-1 font-mono">
                  {reviewing?.sourceFileName}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {reviewing ? (
            <div className="min-h-0 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{kindLabel(reviewing)}</Badge>
                <Badge variant={statusVariant(reviewing.status)}>
                  {statusLabel(reviewing.status)}
                </Badge>
                <Badge variant="secondary">{sourceLabel(reviewing)}</Badge>
                <Badge variant="outline">{reviewing.type}</Badge>
                <Badge variant="outline">{byteCount(reviewing.body)}</Badge>
              </div>

              <ScrollArea className="h-[min(58vh,560px)] rounded-sm border bg-background">
                <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 text-foreground">
                  {reviewBody(reviewing)}
                </pre>
              </ScrollArea>
            </div>
          ) : null}

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setReviewing(null)}>
              Close
            </Button>
            {reviewing && needsReview(reviewing) ? (
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => reviewCurrent(reviewing, "rejected")}
                  disabled={pending}
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <X className="h-4 w-4" aria-hidden />
                  )}
                  Reject
                </Button>
                <Button
                  type="button"
                  onClick={() => reviewCurrent(reviewing, "approved")}
                  disabled={pending}
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden />
                  )}
                  Approve
                </Button>
              </div>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit project standard</DialogTitle>
            <DialogDescription>
              Changes are saved into `project_artifacts` and recorded in the audit log.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <div className="space-y-1.5">
                <Label htmlFor="project-standard-title">Title</Label>
                <Input
                  id="project-standard-title"
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-standard-type">Type</Label>
                <Select
                  value={draft.type}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      type: value as ArtifactFileType,
                    }))
                  }
                >
                  <SelectTrigger id="project-standard-type" className="w-full rounded-sm bg-muted/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=".md">Markdown</SelectItem>
                    <SelectItem value=".txt">Text</SelectItem>
                    <SelectItem value=".html">HTML</SelectItem>
                    <SelectItem value=".json">JSON</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
              <div className="space-y-1.5">
                <Label htmlFor="project-standard-file-name">File name</Label>
                <Input
                  id="project-standard-file-name"
                  value={draft.sourceFileName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      sourceFileName: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-standard-upload">Replace from file</Label>
                <Label
                  htmlFor="project-standard-upload"
                  className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-sm border bg-background px-3 text-sm hover:bg-secondary"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  Upload
                </Label>
                <Input
                  id="project-standard-upload"
                  type="file"
                  accept={FILE_ACCEPT}
                  className="sr-only"
                  onChange={(event) => {
                    void applyFile(event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-standard-body">Content</Label>
              <Textarea
                id="project-standard-body"
                value={draft.body}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, body: event.target.value }))
                }
                rows={14}
                className="font-mono text-xs"
              />
            </div>

            {uploadError ? (
              <div className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {uploadError}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveCurrent} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
