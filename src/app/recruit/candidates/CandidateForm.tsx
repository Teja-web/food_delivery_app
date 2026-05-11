"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractResume } from "@/actions/candidates";
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

export interface CandidateFormData {
  name: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  location: string;
  source: string;
  resumeText: string;
}

const EMPTY_CANDIDATE: CandidateFormData = {
  name: "",
  email: "",
  phone: "",
  title: "",
  company: "",
  location: "",
  source: "",
  resumeText: "",
};

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

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary";

/* -- Resume upload --------------------------------------------------- */

function ResumeUpload({
  onExtracted,
  existingResume,
}: {
  onExtracted: (data: Partial<CandidateFormData> & { resumeText: string }) => void;
  existingResume: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">(existingResume ? "done" : "idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

  const processFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setFileName(file.name);
      setStatus("error");
      setError("File too large — max 2 MB. Try a smaller file or paste the text directly.");
      return;
    }
    setFileName(file.name);
    setStatus("processing");
    setError(null);

    const formData = new FormData();
    formData.set("file", file);

    try {
      const result = await extractResume(formData);
      if (result.error) {
        setStatus("error");
        setError(result.error);
        return;
      }
      if (result.data) {
        setStatus("done");
        onExtracted({
          name: result.data.name || "",
          email: result.data.email || "",
          phone: result.data.phone || "",
          title: result.data.title || "",
          company: result.data.company || "",
          location: result.data.location || "",
          resumeText: result.data.resumeText,
        });
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Extraction failed");
    }
  }, [onExtracted]);

  const reset = () => {
    setStatus("idle");
    setFileName(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (status === "processing") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5">
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground">Reading {fileName}...</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Extracting candidate details</p>
          </div>
        </div>
        <div className="mt-3 h-1 rounded-full bg-amber-100 overflow-hidden">
          <div className="h-full rounded-full bg-amber-500 animate-pulse" style={{ width: "60%" }} />
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/30 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100">
              <X className="h-3 w-3 text-red-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Failed to extract</p>
              <p className="text-[11px] text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={reset} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Resume extracted</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {fileName ? fileName : "Candidate details have been filled in below"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={reset}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Upload different
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
      }}
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
        accept=".pdf,.doc,.docx,.txt,.rtf,.md,.html"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
        }}
      />
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
          <Upload className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-foreground">Upload a resume</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Drop a PDF or text file to extract candidate details automatically. Max 2 MB.
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

/* -- Props ----------------------------------------------------------- */

interface CandidateFormProps {
  initialData: CandidateFormData;
  onSubmit: (data: CandidateFormData) => Promise<void>;
  heading: string;
  subheading: string;
  backHref: string;
  backLabel: string;
  submitLabel: string;
  submittingLabel: string;
  showResumeUpload?: boolean;
}

/* -- Component ------------------------------------------------------- */

export default function CandidateForm({
  initialData,
  onSubmit,
  heading,
  subheading,
  backHref,
  backLabel,
  submitLabel,
  submittingLabel,
  showResumeUpload = true,
}: CandidateFormProps) {
  const [form, setForm] = useState<CandidateFormData>(initialData);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResume, setShowResume] = useState(false);

  const updateField = <K extends keyof CandidateFormData>(key: K, value: CandidateFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleExtracted = useCallback((data: Partial<CandidateFormData> & { resumeText: string }) => {
    setForm((prev) => {
      const next = { ...prev };
      // Only overwrite empty fields
      if (data.name && !prev.name) next.name = data.name;
      if (data.email && !prev.email) next.email = data.email;
      if (data.phone && !prev.phone) next.phone = data.phone;
      if (data.title && !prev.title) next.title = data.title;
      if (data.company && !prev.company) next.company = data.company;
      if (data.location && !prev.location) next.location = data.location;
      next.resumeText = data.resumeText;
      return next;
    });
  }, []);

  const isValid = form.name.trim() && form.email.trim();

  const handleSubmit = async () => {
    setError(null);
    if (!isValid) {
      setError("Name and email are required.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err: any) {
      setError(err.message || "Failed to save candidate.");
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="space-y-6">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            {backLabel}
          </Link>

          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {heading}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{subheading}</p>
          </div>

          {showResumeUpload && (
            <ResumeUpload
              onExtracted={handleExtracted}
              existingResume={!!form.resumeText}
            />
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 flex items-start gap-2">
              <X className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Candidate fields */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-4 space-y-3">
              {/* Row 1: Name, Email, Phone */}
              <div className="grid grid-cols-[1fr_1fr_0.7fr] gap-2.5">
                <div>
                  <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
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
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
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
                    value={form.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
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
                    value={form.title}
                    onChange={(e) => updateField("title", e.target.value)}
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
                    value={form.company}
                    onChange={(e) => updateField("company", e.target.value)}
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
                    value={form.location}
                    onChange={(e) => updateField("location", e.target.value)}
                    placeholder="San Francisco, CA"
                    className={inputClass}
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Source
                  </Label>
                  <Select value={form.source} onValueChange={(v) => updateField("source", v)}>
                    <SelectTrigger className="w-full mt-0.5 h-auto px-2.5 py-1.5 text-xs">
                      <SelectValue placeholder="Select source..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Expandable resume text */}
            {form.resumeText && (
              <>
                <div className="border-t border-border/60 px-4 py-2">
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
                    <ChevronDown className={cn("h-3 w-3 transition-transform", showResume && "rotate-180")} />
                  </Button>
                </div>
                {showResume && (
                  <div className="border-t border-border/60 bg-secondary/10 px-4 py-3">
                    <div className="max-h-60 overflow-y-auto rounded-md border border-border bg-background p-3">
                      <pre className="text-[11px] leading-relaxed text-foreground whitespace-pre-wrap font-mono">
                        {form.resumeText}
                      </pre>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border pt-6">
            <Link
              href={backHref}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </Link>
            <Button
              variant="default"
              onClick={handleSubmit}
              disabled={submitting || !isValid}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
              {submitting ? submittingLabel : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
