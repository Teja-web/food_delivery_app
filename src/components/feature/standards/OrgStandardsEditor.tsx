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
  slug: string;
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
  slug: string;
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
  slug: string;
  body: string;
  format: StandardFormat;
  sourceFileName: string | null;
  hash?: string;
  updatedAt?: string;
}

type Selection =
  | { type: "required"; kind: RequiredStandardKind }
  | { type: "custom"; index: number };

const REQUIRED_DEFS: Array<Pick<RequiredStandardDraft, "kind" | "slug" | "title">> = [
  { kind: "coding_standards", slug: "coding-standards", title: "Coding Standards" },
  { kind: "brand_guidelines", slug: "brand-guidelines", title: "Brand Guidelines" },
  {
    kind: "architecture_principles",
    slug: "architecture-principles",
    title: "Architecture Principles",
  },
];

const FILE_ACCEPT = ".md,.markdown,.txt,text/markdown,text/plain";

function emptyCustomDraft(): CustomStandardDraft {
  return {
    title: "",
    slug: "",
    body: "",
    format: "markdown",
    sourceFileName: null,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
      slug: item.slug,
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
        slug: item.slug.trim(),
        body: item.body,
        format: item.format,
        sourceFileName: item.sourceFileName ?? null,
      }))
      .sort((a, b) => `${a.id ?? ""}:${a.slug}`.localeCompare(`${b.id ?? ""}:${b.slug}`)),
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
        item.slug,
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
    slug: item.slug,
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
        ready
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-700",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          ready ? "bg-emerald-500" : "bg-amber-500",
        )}
        aria-hidden
      />
      {ready ? "Ready" : "Missing"}
    </span>
  );
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-slate-950">{value}</div>
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
      items.map((item, idx) => {
        if (idx !== index) return item;
        const next = { ...item, ...patch };
        if (patch.title !== undefined && item.slug.trim().length === 0) {
          next.slug = slugify(patch.title);
        }
        return next;
      }),
    );
  }

  function updateNewCustom(patch: Partial<CustomStandardDraft>) {
    setNewCustom((item) => {
      const next = { ...item, ...patch };
      if (patch.title !== undefined && item.slug.trim().length === 0) {
        next.slug = slugify(patch.title);
      }
      return next;
    });
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
      toast.success(`${item.title || item.slug} deleted.`);
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
    const slug = newCustom.slug.trim();
    if (!title) {
      setErrors(["Additional standard title is required."]);
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      setErrors(["Additional standard slug must use lowercase letters, digits, and hyphens."]);
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
        slug,
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
            slug: item.slug.trim(),
            body: item.body,
            format: item.format,
            sourceFileName: item.sourceFileName,
          }))
          .filter(
            (item) =>
              item.title.length > 0 || item.slug.length > 0 || item.body.trim().length > 0,
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
    <div className="rounded-[20px] bg-[#f7f8fb] p-4 font-sans text-slate-950 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/70 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-blue-600 text-white shadow-sm shadow-blue-600/20">
              <ShieldCheck className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-[-0.01em]">Standards library</h2>
              <p className="text-sm text-slate-500">
                {totalReady}/3 required standards configured
              </p>
            </div>
          </div>
        </div>
        <Button
          type="button"
          onClick={save}
          disabled={pending || !allRequiredComplete || !hasUnsavedChanges}
          className="rounded-[10px] bg-slate-950 text-white hover:bg-slate-800"
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
        <div className="mt-5 space-y-1 rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errors.map((error) => (
            <div key={error} className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="space-y-2">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Required
            </div>
            {required.map((item) => {
              const selectedCard =
                selection.type === "required" && selection.kind === item.kind;
              return (
                <button
                  key={item.kind}
                  type="button"
                  onClick={() => setSelection({ type: "required", kind: item.kind })}
                  className={cn(
                    "group w-full rounded-[12px] border bg-white p-4 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md",
                    selectedCard
                      ? "border-blue-300 bg-blue-50/70 ring-2 ring-blue-100"
                      : "border-slate-200/80",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{item.title}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {item.sourceFileName ?? "No file uploaded"}
                      </div>
                    </div>
                    <StandardStatus body={item.body} />
                  </div>
                </button>
              );
            })}
          </div>

          {customStandards.length > 0 ? (
            <div className="space-y-2">
              <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Additional
              </div>
              {customStandards.map((item, index) => {
                const selectedCard =
                  selection.type === "custom" && selection.index === index;
                return (
                  <button
                    key={item.id ?? `${item.slug}-${index}`}
                    type="button"
                    onClick={() => setSelection({ type: "custom", index })}
                    className={cn(
                      "group w-full rounded-[12px] border bg-white p-4 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md",
                      selectedCard
                        ? "border-blue-300 bg-blue-50/70 ring-2 ring-blue-100"
                        : "border-slate-200/80",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {item.title || "Untitled standard"}
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500">
                          {item.sourceFileName ?? item.slug}
                        </div>
                      </div>
                      <StandardStatus body={item.body} />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

        </aside>

        <section className="rounded-[16px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" aria-hidden />
                <h3 className="truncate text-lg font-semibold tracking-[-0.01em]">
                  {selected.title || "Untitled standard"}
                </h3>
                <StandardStatus body={selected.body} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {selectedIsCustom ? "Additional organization standard" : "Required organization baseline"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => toggleEditor(selectedEditorKey)}
                className="rounded-[10px] bg-blue-600 text-white hover:bg-blue-700"
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden />
                {selectedEditorOpen ? "Close editor" : "Edit"}
              </Button>
              <Label
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border px-3 text-sm font-medium shadow-xs transition-colors",
                  selectedHasFile
                    ? "border-slate-200 bg-white hover:bg-slate-50"
                    : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
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
                className="rounded-[10px] border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetadataItem
              label="File name"
              value={selected.sourceFileName ?? "No file uploaded"}
            />
            <MetadataItem label="Type" value={selected.format} />
            <MetadataItem label="Size" value={byteCount(selected.body)} />
            <MetadataItem label="Status" value={statusLabel(selected.body)} />
          </div>

          {selectedEditorOpen ? (
            <div className="mt-6 rounded-[14px] border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Manual text editor</div>
                  <div className="text-xs text-slate-500">
                    File contents are hidden until explicitly edited.
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
                className="min-h-[220px] rounded-[12px] border-slate-200 bg-white font-mono text-xs"
                placeholder={`Paste ${selected.title || "standard"} content.`}
              />
            </div>
          ) : (
            <div className="mt-6 rounded-[14px] border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-500">
              {selectedHasFile ? (
                "Use Edit to view or update the text body. Use Replace to upload a new Markdown or text file."
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>No file has been uploaded for this standard yet.</span>
                  <Label className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] bg-blue-600 px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700">
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

      <section className="mt-6 rounded-[16px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold tracking-[-0.01em]">Add additional standard</h3>
            <p className="text-sm text-slate-500">
              Upload a new optional file. Existing additional standards appear in the sidebar.
            </p>
          </div>
          {!addingCustom ? (
            <Button
              type="button"
              onClick={() => setAddingCustom(true)}
              className="rounded-[10px] bg-slate-950 text-white hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" aria-hidden />
              New Standard
            </Button>
          ) : null}
        </div>

        {!addingCustom ? (
          <button
            type="button"
            onClick={() => setAddingCustom(true)}
            className="mt-5 flex w-full items-center justify-between rounded-[14px] border border-dashed border-slate-300 bg-slate-50 p-5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-blue-600 shadow-sm">
                <FilePlus2 className="h-4 w-4" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold">Upload an additional standard</span>
                <span className="block text-xs text-slate-500">
                  Add security, accessibility, QA, or other org-specific guidance.
                </span>
              </span>
            </span>
            <Plus className="h-4 w-4 text-slate-400" aria-hidden />
          </button>
        ) : (
          <div className="mt-5 rounded-[16px] border border-blue-200 bg-blue-50/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">New additional standard</div>
                <div className="text-xs text-slate-500">Upload or paste an optional org file.</div>
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

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
              <Input
                aria-label="New additional standard title"
                placeholder="Title"
                value={newCustom.title}
                onChange={(event) => updateNewCustom({ title: event.target.value })}
                className="rounded-[10px] bg-white"
              />
              <Input
                aria-label="New additional standard slug"
                placeholder="slug"
                value={newCustom.slug}
                onChange={(event) => updateNewCustom({ slug: event.target.value })}
                className="rounded-[10px] bg-white"
              />
              <Label className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 text-sm font-medium shadow-xs transition-colors hover:bg-slate-50">
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

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                className="mt-4 rounded-[12px] bg-white font-mono text-xs"
                placeholder="Paste the standard body."
              />
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewCustomEditorOpen((open) => !open)}
                className="rounded-[10px]"
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden />
                {newCustomEditorOpen ? "Hide text" : "Edit text"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={addCustomStandard}
                className="rounded-[10px] bg-blue-600 text-white hover:bg-blue-700"
              >
                Add standard
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
