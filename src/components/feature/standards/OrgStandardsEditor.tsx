"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FilePlus2,
  FileText,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteOrgStandardAction,
  saveOrgStandardsSetupAction,
  type SavedOrgStandard,
} from "@/actions/standards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type RequiredStandardKind =
  | "coding_standards"
  | "brand_guidelines"
  | "architecture_principles";
type StandardKind = RequiredStandardKind | "custom";
type StandardFormat = "markdown" | "text";

export interface OrgStandardEditorItem {
  id: string;
  kind: StandardKind;
  title: string;
  body: string;
  format: StandardFormat;
  version: string;
  hash: string;
  sourceFileName: string | null;
  updatedAt: string;
}

interface RequiredStandardDraft {
  id?: string;
  kind: RequiredStandardKind;
  title: string;
  body: string;
  format: StandardFormat;
  sourceFileName: string | null;
  hash?: string;
  updatedAt?: string;
}

interface CustomStandardDraft {
  id?: string;
  title: string;
  body: string;
  format: StandardFormat;
  sourceFileName: string | null;
  hash?: string;
  updatedAt?: string;
}

type Selection =
  | { type: "required"; kind: RequiredStandardKind }
  | { type: "custom"; index: number };

const REQUIRED_DEFS: Array<Pick<RequiredStandardDraft, "kind" | "title">> = [
  { kind: "coding_standards", title: "Coding Standards" },
  { kind: "brand_guidelines", title: "Brand Guidelines" },
  {
    kind: "architecture_principles",
    title: "Architecture Principles",
  },
];

const FILE_ACCEPT = ".md,.markdown,.txt,text/markdown,text/plain";

function emptyCustomDraft(): CustomStandardDraft {
  return {
    title: "",
    body: "",
    format: "markdown",
    sourceFileName: null,
  };
}

function inferFormat(fileName: string): StandardFormat {
  return fileName.toLowerCase().endsWith(".txt") ? "text" : "markdown";
}

function isAcceptedTextFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".txt") ||
    file.type === "text/plain" ||
    file.type === "text/markdown" ||
    file.type === ""
  );
}

function initialRequiredDrafts(items: OrgStandardEditorItem[]): RequiredStandardDraft[] {
  return REQUIRED_DEFS.map((def) => {
    const existing = items.find((item) => item.kind === def.kind);
    return {
      ...def,
      id: existing?.id,
      body: existing?.body ?? "",
      format: existing?.format ?? "markdown",
      sourceFileName: existing?.sourceFileName ?? null,
      hash: existing?.hash,
      updatedAt: existing?.updatedAt,
    };
  });
}

function initialCustomDrafts(items: OrgStandardEditorItem[]): CustomStandardDraft[] {
  return items
    .filter((item) => item.kind === "custom")
    .map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      format: item.format,
      sourceFileName: item.sourceFileName,
      hash: item.hash,
      updatedAt: item.updatedAt,
    }));
}

function canonicalDraftSnapshot(input: {
  required: RequiredStandardDraft[];
  customStandards: CustomStandardDraft[];
}): string {
  return JSON.stringify({
    required: input.required.map((item) => ({
      kind: item.kind,
      body: item.body,
      format: item.format,
      sourceFileName: item.sourceFileName ?? null,
    })),
    additional: input.customStandards
      .map((item) => ({
        id: item.id ?? null,
        title: item.title.trim(),
        body: item.body,
        format: item.format,
        sourceFileName: item.sourceFileName ?? null,
      }))
      .sort((a, b) =>
        `${a.id ?? ""}:${a.sourceFileName ?? ""}:${a.title}`.localeCompare(
          `${b.id ?? ""}:${b.sourceFileName ?? ""}:${b.title}`,
        ),
      ),
  });
}

function snapshotFromStandards(items: OrgStandardEditorItem[]): string {
  return canonicalDraftSnapshot({
    required: initialRequiredDrafts(items),
    customStandards: initialCustomDrafts(items),
  });
}

function standardsKey(items: OrgStandardEditorItem[]): string {
  return items
    .map((item) =>
      [
        item.kind,
        item.id,
        item.hash,
        item.sourceFileName ?? "",
        item.updatedAt,
      ].join(":"),
    )
    .join("|");
}

function fromSavedStandards(items: SavedOrgStandard[]): OrgStandardEditorItem[] {
  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    body: item.body,
    format: item.format,
    version: item.version,
    hash: item.hash,
    sourceFileName: item.sourceFileName,
    updatedAt: item.updatedAt,
  }));
}

function byteCount(value: string): string {
  const bytes = new TextEncoder().encode(value).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function statusLabel(body: string): "Ready" | "Missing" {
  return body.trim().length > 0 ? "Ready" : "Missing";
}

function StandardStatus({ body }: { body: string }) {
  const ready = body.trim().length > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        ready ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          ready ? "bg-primary" : "bg-muted-foreground",
        )}
        aria-hidden
      />
      {ready ? "Ready" : "Missing"}
    </span>
  );
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border bg-background px-3 py-2">
      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

export function OrgStandardsEditor({
  initialStandards,
  missingRequired,
  mode = "settings",
  onSaved,
}: {
  initialStandards: OrgStandardEditorItem[];
  missingRequired: RequiredStandardKind[];
  mode?: "setup" | "settings";
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const [required, setRequired] = useState<RequiredStandardDraft[]>(() =>
    initialRequiredDrafts(initialStandards),
  );
  const [customStandards, setCustomStandards] = useState<CustomStandardDraft[]>(() =>
    initialCustomDrafts(initialStandards),
  );
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    snapshotFromStandards(initialStandards),
  );
  const [newCustom, setNewCustom] = useState<CustomStandardDraft>(() => emptyCustomDraft());
  const [addingCustom, setAddingCustom] = useState(false);
  const [newCustomEditorOpen, setNewCustomEditorOpen] = useState(false);
  const [openEditors, setOpenEditors] = useState<Set<string>>(new Set());

  const initialStandardsKey = useMemo(
    () => standardsKey(initialStandards),
    [initialStandards],
  );
  const firstMissingIndex = useMemo(() => {
    const idx = REQUIRED_DEFS.findIndex((def) => missingRequired.includes(def.kind));
    return idx >= 0 ? idx : 0;
  }, [missingRequired]);
  const firstSelectedKind = REQUIRED_DEFS[firstMissingIndex]?.kind ?? "coding_standards";
  const [selection, setSelection] = useState<Selection>({
    type: "required",
    kind: firstSelectedKind,
  });

  const fallbackRequired: RequiredStandardDraft = required[0] ?? {
    ...REQUIRED_DEFS[0],
    body: "",
    format: "markdown",
    sourceFileName: null,
  };
  const selectedCustom =
    selection.type === "custom" ? customStandards[selection.index] : undefined;
  const selectedRequired = selectedCustom
    ? fallbackRequired
    : required.find((item) =>
        selection.type === "required" ? item.kind === selection.kind : false,
      ) ?? fallbackRequired;
  const selected = selectedCustom ?? selectedRequired;
  const selectedIsCustom = Boolean(selectedCustom);
  const selectedEditorKey = selectedIsCustom
    ? `custom:${selection.type === "custom" ? selection.index : 0}`
    : `required:${selectedRequired.kind}`;
  const selectedEditorOpen = openEditors.has(selectedEditorKey);
  const selectedHasFile = selected.body.trim().length > 0;
  const allRequiredComplete = required.every((item) => item.body.trim().length > 0);
  const currentSnapshot = useMemo(
    () => canonicalDraftSnapshot({ required, customStandards }),
    [required, customStandards],
  );
  const hasUnsavedChanges = currentSnapshot !== savedSnapshot;
  const totalReady = required.filter((item) => item.body.trim().length > 0).length;

  useEffect(() => {
    setRequired(initialRequiredDrafts(initialStandards));
    setCustomStandards(initialCustomDrafts(initialStandards));
    setSavedSnapshot(snapshotFromStandards(initialStandards));
    setSelection({ type: "required", kind: firstSelectedKind });
  }, [initialStandards, initialStandardsKey, firstSelectedKind]);

  function replaceDrafts(items: OrgStandardEditorItem[]) {
    setRequired(initialRequiredDrafts(items));
    setCustomStandards(initialCustomDrafts(items));
    setSavedSnapshot(snapshotFromStandards(items));
    setNewCustom(emptyCustomDraft());
    setAddingCustom(false);
    setNewCustomEditorOpen(false);
    setOpenEditors(new Set());
    setSelection({ type: "required", kind: "coding_standards" });
  }

  function updateRequired(
    kind: RequiredStandardKind,
    patch: Partial<RequiredStandardDraft>,
  ) {
    setRequired((items) =>
      items.map((item) => (item.kind === kind ? { ...item, ...patch } : item)),
    );
  }

  function updateCustom(index: number, patch: Partial<CustomStandardDraft>) {
    setCustomStandards((items) =>
      items.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    );
  }

  function updateNewCustom(patch: Partial<CustomStandardDraft>) {
    setNewCustom((item) => ({ ...item, ...patch }));
  }

  function toggleEditor(key: string) {
    setOpenEditors((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearRequiredDraft(kind: RequiredStandardKind) {
    updateRequired(kind, {
      id: undefined,
      body: "",
      sourceFileName: null,
      hash: undefined,
      updatedAt: undefined,
    });
    setOpenEditors((current) => {
      const next = new Set(current);
      next.delete(`required:${kind}`);
      return next;
    });
  }

  function deleteRequired(item: RequiredStandardDraft) {
    if (!item.id) {
      clearRequiredDraft(item.kind);
      return;
    }
    startTransition(async () => {
      const result = await deleteOrgStandardAction(item.id!);
      if (!result.ok) {
        setErrors([result.error]);
        return;
      }
      clearRequiredDraft(item.kind);
      toast.success(`${item.title} deleted.`);
      router.refresh();
    });
  }

  function deleteCustom(index: number) {
    const item = customStandards[index];
    if (!item) return;
    if (!item.id) {
      setCustomStandards((items) => items.filter((_, idx) => idx !== index));
      setSelection({ type: "required", kind: "coding_standards" });
      return;
    }
    startTransition(async () => {
      const result = await deleteOrgStandardAction(item.id!);
      if (!result.ok) {
        setErrors([result.error]);
        return;
      }
      setCustomStandards((items) => items.filter((_, idx) => idx !== index));
      setSelection({ type: "required", kind: "coding_standards" });
      setOpenEditors((current) => {
        const next = new Set(current);
        next.delete(`custom:${index}`);
        return next;
      });
      toast.success(`${item.title || item.sourceFileName || "Additional standard"} deleted.`);
      router.refresh();
    });
  }

  async function applyFile(
    file: File | undefined,
    apply: (patch: { body: string; sourceFileName: string; format: StandardFormat }) => void,
  ) {
    if (!file) return;
    if (!isAcceptedTextFile(file)) {
      setErrors([`${file.name} is not a Markdown or text file.`]);
      return;
    }
    const body = await file.text();
    apply({
      body,
      sourceFileName: file.name,
      format: inferFormat(file.name),
    });
    setErrors([]);
  }

  function applyFileToSelected(patch: {
    body: string;
    sourceFileName: string;
    format: StandardFormat;
  }) {
    if (selectedIsCustom && selection.type === "custom") {
      updateCustom(selection.index, patch);
      return;
    }
    updateRequired(selectedRequired.kind, patch);
  }

  function updateSelectedBody(body: string) {
    if (selectedIsCustom && selection.type === "custom") {
      updateCustom(selection.index, { body });
      return;
    }
    updateRequired(selectedRequired.kind, { body });
  }

  function deleteSelected() {
    if (selectedIsCustom && selection.type === "custom") {
      deleteCustom(selection.index);
      return;
    }
    deleteRequired(selectedRequired);
  }

  function addCustomStandard() {
    const title = newCustom.title.trim();
    if (!title) {
      setErrors(["Additional standard title is required."]);
      return;
    }
    if (newCustom.body.trim().length === 0) {
      setErrors(["Upload a file or add text for the additional standard."]);
      return;
    }

    const nextIndex = customStandards.length;
    setCustomStandards((items) => [
      ...items,
      {
        ...newCustom,
        title,
      },
    ]);
    setSelection({ type: "custom", index: nextIndex });
    setNewCustom(emptyCustomDraft());
    setAddingCustom(false);
    setNewCustomEditorOpen(false);
    setErrors([]);
  }

  function save() {
    setErrors([]);
    const byKind = new Map(required.map((item) => [item.kind, item]));
    const coding = byKind.get("coding_standards");
    const brand = byKind.get("brand_guidelines");
    const architecture = byKind.get("architecture_principles");
    if (!coding || !brand || !architecture) {
      setErrors(["Required standard drafts are incomplete."]);
      return;
    }

    startTransition(async () => {
      const result = await saveOrgStandardsSetupAction({
        codingStandardsBody: coding.body,
        codingStandardsFormat: coding.format,
        codingStandardsSourceFileName: coding.sourceFileName,
        brandGuidelinesBody: brand.body,
        brandGuidelinesFormat: brand.format,
        brandGuidelinesSourceFileName: brand.sourceFileName,
        architecturePrinciplesBody: architecture.body,
        architecturePrinciplesFormat: architecture.format,
        architecturePrinciplesSourceFileName: architecture.sourceFileName,
        customStandards: customStandards
          .map((item) => ({
            title: item.title.trim(),
            body: item.body,
            type: (item.format === "text" ? ".txt" : ".md") as ".md" | ".txt",
            sourceFileName: item.sourceFileName,
          }))
          .filter(
            (item) =>
              item.title.length > 0 || item.body.trim().length > 0,
          ),
      });
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      replaceDrafts(fromSavedStandards(result.standards));
      toast.success(
        mode === "setup" ? "Organization standards are ready." : "Organization standards saved.",
      );
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <div className="rounded-sm border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-sm border bg-background">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            </span>
            <div>
              <h2 className="text-base font-semibold">Standards library</h2>
              <p className="text-xs text-muted-foreground">
                {totalReady}/3 required standards configured. Updates are audited and hash tracked.
              </p>
            </div>
          </div>
        </div>
        <Button
          type="button"
          onClick={save}
          disabled={pending || !allRequiredComplete || !hasUnsavedChanges}
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Saving
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>

      {errors.length > 0 ? (
        <div className="m-3 space-y-1 rounded-sm border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {errors.map((error) => (
            <div key={error} className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4 border-b p-3 lg:border-b-0 lg:border-r">
          <div className="space-y-2">
            <div className="px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              Required
            </div>
            {required.map((item) => {
              const selectedCard =
                selection.type === "required" && selection.kind === item.kind;
              return (
                <Button
                  key={item.kind}
                  type="button"
                  variant="unstyled"
                  onClick={() => setSelection({ type: "required", kind: item.kind })}
                  className={cn(
                    "group w-full rounded-sm border bg-background px-3 py-2 text-left transition-colors hover:bg-secondary",
                    selectedCard
                      ? "border-primary/40 bg-primary/5"
                      : "border-border",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{item.title}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {item.sourceFileName ?? "No file uploaded"}
                      </div>
                    </div>
                    <StandardStatus body={item.body} />
                  </div>
                </Button>
              );
            })}
          </div>

          {customStandards.length > 0 ? (
            <div className="space-y-2">
              <div className="px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Additional
              </div>
              {customStandards.map((item, index) => {
                const selectedCard =
                  selection.type === "custom" && selection.index === index;
                return (
                  <Button
                    key={item.id ?? `${item.sourceFileName ?? item.title}-${index}`}
                    type="button"
                    variant="unstyled"
                    onClick={() => setSelection({ type: "custom", index })}
                    className={cn(
                      "group w-full rounded-sm border bg-background px-3 py-2 text-left transition-colors hover:bg-secondary",
                      selectedCard
                        ? "border-primary/40 bg-primary/5"
                        : "border-border",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {item.title || "Untitled standard"}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {item.sourceFileName ?? "No file uploaded"}
                        </div>
                      </div>
                      <StandardStatus body={item.body} />
                    </div>
                  </Button>
                );
              })}
            </div>
          ) : null}

        </aside>

        <section className="min-w-0 p-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-4 w-4 text-primary" aria-hidden />
                <h3 className="truncate text-lg font-semibold tracking-[-0.01em]">
                  {selected.title || "Untitled standard"}
                </h3>
                <StandardStatus body={selected.body} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedIsCustom ? "Additional organization standard" : "Required organization baseline"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => toggleEditor(selectedEditorKey)}
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden />
                {selectedEditorOpen ? "Close editor" : "Edit"}
              </Button>
              <Label
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-sm border px-3 text-sm font-medium transition-colors",
                  selectedHasFile
                    ? "bg-background hover:bg-secondary"
                    : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
                )}
              >
                {selectedHasFile ? (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                )}
                {selectedHasFile ? "Replace" : "Upload"}
                <Input
                  type="file"
                  accept={FILE_ACCEPT}
                  className="sr-only"
                  onChange={(event) =>
                    void applyFile(event.target.files?.[0], applyFileToSelected)
                  }
                />
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={deleteSelected}
                disabled={pending || selected.body.trim().length === 0}
                className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete
              </Button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetadataItem
              label="File name"
              value={selected.sourceFileName ?? "No file uploaded"}
            />
            <MetadataItem label="Type" value={selected.format} />
            <MetadataItem label="Size" value={byteCount(selected.body)} />
            <MetadataItem label="Status" value={statusLabel(selected.body)} />
          </div>

          {selectedEditorOpen ? (
            <div className="mt-3 rounded-sm border bg-background p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Exact document body</div>
                  <div className="text-xs text-muted-foreground">
                    This text is stored verbatim and inherited by projects unless overridden.
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => toggleEditor(selectedEditorKey)}
                  aria-label="Close editor"
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <Textarea
                value={selected.body}
                onChange={(event) => updateSelectedBody(event.target.value)}
                rows={mode === "setup" ? 8 : 10}
                className="min-h-[240px] font-mono text-xs"
                placeholder={`Paste ${selected.title || "standard"} content.`}
              />
            </div>
          ) : (
            <div className="mt-3 rounded-sm border border-dashed bg-background p-3 text-sm text-muted-foreground">
              {selectedHasFile ? (
                "Use Edit to view or update the text body. Use Replace to upload a new Markdown or text file."
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>No file has been uploaded for this standard yet.</span>
                  <Label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-sm border bg-background px-3 text-sm font-medium transition-colors hover:bg-secondary">
                    <Upload className="h-3.5 w-3.5" aria-hidden />
                    Upload file
                    <Input
                      type="file"
                      accept={FILE_ACCEPT}
                      className="sr-only"
                      onChange={(event) =>
                        void applyFile(event.target.files?.[0], applyFileToSelected)
                      }
                    />
                  </Label>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="border-t bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold tracking-[-0.01em]">Add additional standard</h3>
            <p className="text-xs text-muted-foreground">
              Upload a new optional file. Existing additional standards appear in the sidebar.
            </p>
          </div>
          {!addingCustom ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddingCustom(true)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New Standard
            </Button>
          ) : null}
        </div>

        {!addingCustom ? (
          <Button
            type="button"
            variant="unstyled"
            onClick={() => setAddingCustom(true)}
            className="mt-3 flex w-full items-center justify-between rounded-sm border border-dashed bg-background p-3 text-left transition-colors hover:bg-secondary"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-sm border bg-card text-primary">
                <FilePlus2 className="h-4 w-4" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold">Upload an additional standard</span>
                <span className="block text-xs text-muted-foreground">
                  Add security, accessibility, QA, or other org-specific guidance.
                </span>
              </span>
            </span>
            <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />
          </Button>
        ) : (
          <div className="mt-3 rounded-sm border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">New additional standard</div>
                <div className="text-xs text-muted-foreground">Upload or paste an optional org file.</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setNewCustom(emptyCustomDraft());
                  setNewCustomEditorOpen(false);
                  setAddingCustom(false);
                }}
                aria-label="Cancel new standard"
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
              <Input
                aria-label="New additional standard title"
                placeholder="Title"
                value={newCustom.title}
                onChange={(event) => updateNewCustom({ title: event.target.value })}
              />
              <Label className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-sm border bg-background px-3 text-sm font-medium transition-colors hover:bg-secondary">
                <Upload className="h-3.5 w-3.5" aria-hidden />
                {newCustom.body.trim().length > 0 ? "Replace" : "Upload"}
                <Input
                  type="file"
                  accept={FILE_ACCEPT}
                  className="sr-only"
                  onChange={(event) =>
                    void applyFile(event.target.files?.[0], (patch) =>
                      updateNewCustom(patch),
                    )
                  }
                />
              </Label>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <MetadataItem
                label="File name"
                value={newCustom.sourceFileName ?? "No file uploaded"}
              />
              <MetadataItem label="Size" value={byteCount(newCustom.body)} />
            </div>

            {newCustomEditorOpen ? (
              <Textarea
                aria-label="New additional standard body"
                value={newCustom.body}
                onChange={(event) => updateNewCustom({ body: event.target.value })}
                rows={7}
                className="mt-3 font-mono text-xs"
                placeholder="Paste the standard body."
              />
            ) : null}

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewCustomEditorOpen((open) => !open)}
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden />
                {newCustomEditorOpen ? "Hide text" : "Edit text"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={addCustomStandard}
              >
                Add standard
              </Button>
            </div>
          </div>
        )}
      </section>

      {!allRequiredComplete ? (
        <div className="border-t bg-primary/5 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div>
              <div className="font-medium">Required standards are incomplete.</div>
              <p className="mt-1 text-xs text-muted-foreground">
                This management page remains available so admins can repair missing files. Other
                governed app flows stay gated until all three required standards are saved.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
