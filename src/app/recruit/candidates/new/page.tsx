"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { addCandidate, extractResume } from "@/actions/candidates";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* -- Types ----------------------------------------------------------- */

interface CandidateEntry {
  id: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  location: string;
  source: string;
  resumeText: string;
  resumeUrl: string | null;
  fileName: string | null;
  extracting: boolean;
  extractError: string | null;
}

let entryCounter = 0;
function createEntry(overrides?: Partial<CandidateEntry>): CandidateEntry {
  return {
    id: `entry-${++entryCounter}`,
    name: "",
    email: "",
    phone: "",
    title: "",
    company: "",
    location: "",
    source: "",
    resumeText: "",
    resumeUrl: null,
    fileName: null,
    extracting: false,
    extractError: null,
    ...overrides,
  };
}

const MAX_ENTRIES = 5;

const SOURCES = [
  { value: "referral", label: "Referral" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "job_board", label: "Job Board" },
  { value: "career_site", label: "Career Site" },
  { value: "recruiter", label: "Recruiter" },
  { value: "vendor", label: "Vendor" },
  { value: "event", label: "Event" },
  { value: "other", label: "Other" },
];

/* -- Compact input --------------------------------------------------- */

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary";

/* -- Resume upload zone ---------------------------------------------- */

function ResumeDropZone({
  slotsRemaining,
  onFiles,
}: {
  slotsRemaining: number;
  onFiles: (files: File[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files).slice(0, slotsRemaining);
      if (files.length > 0) onFiles(files);
    },
    [slotsRemaining, onFiles],
  );

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).slice(0, slotsRemaining);
      if (files.length > 0) onFiles(files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [slotsRemaining, onFiles],
  );

  if (slotsRemaining <= 0) return null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={cn(
        "rounded-xl border border-dashed p-5 transition-colors cursor-pointer",
        dragOver
          ? "border-primary bg-primary/5"
          : "border-border bg-card/50 hover:border-muted-foreground/30",
      )}
    >
      <Input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.rtf,.md,.html"
        className="hidden"
        onChange={handleSelect}
      />
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
          <Upload className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-foreground">
            Upload resumes
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Drop up to {slotsRemaining} resume{slotsRemaining !== 1 ? "s" : ""}{" "}
            to extract candidate details automatically
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <FileText className="h-3 w-3" />
          PDF, DOCX, TXT
        </div>
      </div>
    </div>
  );
}

/* -- Candidate card -------------------------------------------------- */

function CandidateCard({
  entry,
  index,
  total,
  onChange,
  onRemove,
}: {
  entry: CandidateEntry;
  index: number;
  total: number;
  onChange: (id: string, field: keyof CandidateEntry, value: string) => void;
  onRemove: (id: string) => void;
}) {
  const [showResume, setShowResume] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/30 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
            {index + 1}/{total}
          </span>
          {entry.extracting && (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-600">
              <Loader2 className="h-3 w-3 animate-spin" />
              Extracting...
            </span>
          )}
          {entry.extractError && (
            <span className="text-[11px] text-red-600">
              {entry.extractError}
            </span>
          )}
          {entry.fileName && !entry.extracting && !entry.extractError && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <FileText className="h-3 w-3" />
              {entry.fileName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {entry.resumeText && (
            <Button
              variant="ghost"
              onClick={() => setShowResume(!showResume)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                showResume
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary",
              )}
            >
              <FileText className="h-3 w-3" />
              Resume
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  showResume && "rotate-180",
                )}
              />
            </Button>
          )}
          {total > 1 && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onRemove(entry.id)}
              className="rounded-md p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Compact form — 3 rows */}
      <div className="px-4 py-3 space-y-2.5">
        {/* Row 1: Name, Email, Phone */}
        <div className="grid grid-cols-[1fr_1fr_0.7fr] gap-2.5">
          <div>
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              value={entry.name}
              onChange={(e) => onChange(entry.id, "name", e.target.value)}
              placeholder="Jane Smith"
              className={inputClass}
            />
          </div>
          <div>
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              type="email"
              value={entry.email}
              onChange={(e) => onChange(entry.id, "email", e.target.value)}
              placeholder="jane@example.com"
              className={inputClass}
            />
          </div>
          <div>
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Phone
            </Label>
            <Input
              type="tel"
              value={entry.phone}
              onChange={(e) => onChange(entry.id, "phone", e.target.value)}
              placeholder="+1 (555) 123-4567"
              className={inputClass}
            />
          </div>
        </div>

        {/* Row 2: Title, Company */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Title
            </Label>
            <Input
              type="text"
              value={entry.title}
              onChange={(e) => onChange(entry.id, "title", e.target.value)}
              placeholder="Software Engineer"
              className={inputClass}
            />
          </div>
          <div>
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Company
            </Label>
            <Input
              type="text"
              value={entry.company}
              onChange={(e) => onChange(entry.id, "company", e.target.value)}
              placeholder="Acme Inc."
              className={inputClass}
            />
          </div>
        </div>

        {/* Row 3: Location, Source */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Location
            </Label>
            <Input
              type="text"
              value={entry.location}
              onChange={(e) => onChange(entry.id, "location", e.target.value)}
              placeholder="San Francisco, CA"
              className={inputClass}
            />
          </div>
          <div>
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Source
            </Label>
            <Select value={entry.source} onValueChange={(v) => onChange(entry.id, "source", v)}>
              <SelectTrigger className="w-full mt-0.5 h-auto px-2.5 py-1.5 text-xs">
                <SelectValue placeholder="Select source..." />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Expandable resume text */}
      {showResume && entry.resumeText && (
        <div className="border-t border-border/60 bg-secondary/10 px-4 py-3">
          <div className="max-h-60 overflow-y-auto rounded-md border border-border bg-background p-3">
            <pre className="text-[11px] leading-relaxed text-foreground whitespace-pre-wrap font-mono">
              {entry.resumeText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/* -- Page ------------------------------------------------------------ */

export default function NewCandidatePage() {
  const router = useRouter();
  const [entries, setEntries] = useState<CandidateEntry[]>([createEntry()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasOneEmpty =
    entries.length === 1 &&
    !entries[0].name &&
    !entries[0].email &&
    !entries[0].fileName;

  const slotsRemaining = MAX_ENTRIES - entries.length + (hasOneEmpty ? 1 : 0);

  const updateEntry = useCallback(
    (id: string, field: keyof CandidateEntry, value: string) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
      );
    },
    [],
  );

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      return next.length === 0 ? [createEntry()] : next;
    });
  }, []);

  const addEmptyEntry = useCallback(() => {
    setEntries((prev) => {
      if (prev.length >= MAX_ENTRIES) return prev;
      return [...prev, createEntry()];
    });
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const available = MAX_ENTRIES - entries.length + (hasOneEmpty ? 1 : 0);
      const toProcess = files.slice(0, available);
      if (toProcess.length === 0) return;

      const newEntries = toProcess.map((file, i) => {
        if (i === 0 && hasOneEmpty) return { ...entries[0], fileName: file.name, extracting: true };
        return createEntry({ fileName: file.name, extracting: true });
      });

      const merged = hasOneEmpty
        ? [newEntries[0]!, ...entries.slice(1), ...newEntries.slice(1)]
        : [...entries, ...newEntries];

      setEntries(merged);

      // Process all files in parallel
      await Promise.all(
        toProcess.map(async (file, i) => {
          const entryId = newEntries[i]!.id;

          const formData = new FormData();
          formData.set("file", file);

          try {
            const result = await extractResume(formData);
            if (result.error) {
              setEntries((prev) =>
                prev.map((e) =>
                  e.id === entryId
                    ? { ...e, extracting: false, extractError: result.error! }
                    : e,
                ),
              );
            } else if (result.data) {
              const d = result.data;
              setEntries((prev) =>
                prev.map((e) =>
                  e.id === entryId
                    ? {
                        ...e,
                        name: d.name || "",
                        email: d.email || "",
                        phone: d.phone || "",
                        title: d.title || "",
                        company: d.company || "",
                        location: d.location || "",
                        resumeText: d.resumeText,
                        resumeUrl: d.resumeUrl,
                        fileName: d.fileName,
                        extracting: false,
                        extractError: null,
                      }
                    : e,
                ),
              );
            }
          } catch (err) {
            setEntries((prev) =>
              prev.map((e) =>
                e.id === entryId
                  ? { ...e, extracting: false, extractError: err instanceof Error ? err.message : "Extraction failed" }
                  : e,
              ),
            );
          }
        }),
      );
    },
    [entries, hasOneEmpty],
  );

  const validEntries = entries.filter(
    (e) => e.name.trim() && e.email.trim() && !e.extracting,
  );

  const handleSubmit = async () => {
    setError(null);

    if (validEntries.length === 0) {
      setError("At least one candidate needs a name and email.");
      return;
    }

    setSubmitting(true);

    const results = await Promise.all(
      validEntries.map(async (e): Promise<{ id: string; error?: string }> => {
        try {
          const payload: Record<string, unknown> = {
            name: e.name.trim(),
            email: e.email.trim(),
          };
          if (e.phone.trim()) payload.phone = e.phone.trim();
          if (e.title.trim()) payload.title = e.title.trim();
          if (e.company.trim()) payload.company = e.company.trim();
          if (e.location.trim()) payload.location = e.location.trim();
          if (e.source) payload.source = e.source;
          if (e.resumeText.trim()) payload.resumeText = e.resumeText.trim();
          if (e.resumeUrl) payload.resumeUrl = e.resumeUrl;

          const result = await addCandidate(payload);
          if (result && "error" in result) {
            return { id: e.id, error: String((result as any).error) };
          }
          return { id: e.id };
        } catch (err: any) {
          return { id: e.id, error: err.message || "Failed" };
        }
      }),
    );

    const failures = results.filter((r) => r.error);
    if (failures.length > 0) {
      setError(
        `${failures.length} of ${validEntries.length} failed: ${failures.map((f) => f.error).join("; ")}`,
      );
      setSubmitting(false);
    } else if (validEntries.length === 1) {
      // Single candidate — go to their profile
      const successResult = results[0];
      // Since we don't have the ID from addCandidate result in results, go to list
      router.push("/recruit/candidates");
    } else {
      router.push("/recruit/candidates");
    }
  };

  const isExtracting = entries.some((e) => e.extracting);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="space-y-6">
          <Link
            href="/recruit/candidates"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Candidates
          </Link>

          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Add candidates
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload resumes to extract details automatically, or fill in
              manually. Up to {MAX_ENTRIES} at a time.
            </p>
          </div>

          {/* Resume upload zone */}
          <ResumeDropZone
            slotsRemaining={slotsRemaining}
            onFiles={handleFiles}
          />

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 flex items-start gap-2">
              <X className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Candidate cards */}
          <div className="space-y-3">
            {entries.map((entry, i) => (
              <CandidateCard
                key={entry.id}
                entry={entry}
                index={i}
                total={entries.length}
                onChange={updateEntry}
                onRemove={removeEntry}
              />
            ))}
          </div>

          {/* Add another */}
          {slotsRemaining > 0 && (
            <Button
              variant="ghost"
              onClick={addEmptyEntry}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add another candidate
            </Button>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border pt-6">
            <Link
              href="/recruit/candidates"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </Link>
            <div className="flex items-center gap-3">
              {submitting && validEntries.length > 1 && (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {validEntries.length} candidates
                </span>
              )}
              <Button
                variant="default"
                onClick={handleSubmit}
                disabled={
                  submitting || isExtracting || validEntries.length === 0
                }
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
                {submitting
                  ? "Saving..."
                  : validEntries.length === 1
                    ? "Save candidate"
                    : `Save ${validEntries.length} candidates`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
