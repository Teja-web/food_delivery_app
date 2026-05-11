"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Trash2,
  Upload,
  FileText,
  Loader2,
  X,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompensationRange } from "@/lib/format-compensation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { extractJd, generateRoleFields, enrichRoleField } from "@/actions/roles";
import { listDepartments } from "@/actions/departments";
import { listMembers } from "@/actions/team";
import { fetchVendorPartnerships } from "@/actions/vendor-partnerships";
import type { RoleWizardOutput } from "@/automations/agents/definitions/role-wizard";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/* -- Types ----------------------------------------------------------- */

export interface Competency {
  name: string;
  weight: string;
}

export interface InterviewStage {
  name: string;
  interviewer: string;
  durationMins: number;
  competencies: string[];
  assessment: string | null;
}

export interface Compensation {
  min: number | null;
  max: number | null;
  currency: string | null;
  equity: string | null;
  bonus: string | null;
}

export interface RoleFormData {
  title: string;
  department: string;
  team: string;
  hiringManager: string;
  recruiter: string;
  location: string;
  headcount: number;
  compensation: Compensation;
  employmentType: string;
  targetHireDate: string;
  businessCase: string;
  description: string;
  competencies: Competency[];
  mustHaves: string;
  niceToHaves: string;
  interviewStages: InterviewStage[];
  /**
   * Vendor visibility on this role:
   *   "internal"  — no vendors (default)
   *   "all"       — every active partnered vendor
   *   "exclusive" — only the vendor in `exclusiveVendorOrgId`
   */
  vendorVisibility: "internal" | "all" | "exclusive";
  /** Required when vendorVisibility === "exclusive". */
  exclusiveVendorOrgId: string | null;
}

export const EMPTY_FORM: RoleFormData = {
  title: "",
  department: "",
  team: "",
  hiringManager: "",
  recruiter: "",
  location: "",
  headcount: 1,
  compensation: { min: null, max: null, currency: null, equity: null, bonus: null },
  employmentType: "Full-time",
  targetHireDate: "",
  businessCase: "",
  description: "",
  competencies: [],
  mustHaves: "",
  niceToHaves: "",
  interviewStages: [],
  vendorVisibility: "internal",
  exclusiveVendorOrgId: null,
};

function formatCompensation(comp: Compensation): string {
  if (comp.min == null || comp.max == null) return "";
  return formatCompensationRange({ min: comp.min, max: comp.max, currency: comp.currency || undefined, equity: comp.equity || undefined, bonus: comp.bonus || undefined });
}

function hydrateFromWizard(data: RoleWizardOutput, current: RoleFormData): Partial<RoleFormData> {
  const patch: Partial<RoleFormData> = {};

  if (data.title && !current.title) patch.title = data.title;
  if (data.department && !current.department) patch.department = data.department;
  if (data.team && !current.team) patch.team = data.team;
  if (data.location && !current.location) patch.location = data.location;
  if (data.headcount && current.headcount === 1) patch.headcount = data.headcount;
  if (data.compensation && current.compensation.min == null) {
    patch.compensation = {
      min: data.compensation.min,
      max: data.compensation.max,
      currency: data.compensation.currency ?? null,
      equity: data.compensation.equity ?? null,
      bonus: data.compensation.bonus ?? null,
    };
  }
  if (data.employmentType && current.employmentType === "Full-time") patch.employmentType = data.employmentType;
  if (data.businessCase && !current.businessCase) patch.businessCase = data.businessCase;
  if (data.description && !current.description) patch.description = data.description;

  if (data.competencies?.length) {
    patch.competencies = data.competencies.map((c) => ({
      name: c.name,
      weight: c.weight === "required" ? "Required" : c.weight === "preferred" ? "Preferred" : "Nice to have",
    }));
  }
  if (data.mustHaves) patch.mustHaves = data.mustHaves;
  if (data.niceToHaves) patch.niceToHaves = data.niceToHaves;

  if (data.interviewStages?.length) {
    patch.interviewStages = data.interviewStages.map((s) => ({
      name: s.name,
      interviewer: s.interviewer,
      durationMins: s.durationMins,
      competencies: s.competencies,
      assessment: null,
    }));
  }

  return patch;
}

/** Convert form state to the shape the server action expects */
function formToWizardContext(form: RoleFormData) {
  return {
    title: form.title || undefined,
    department: form.department || undefined,
    team: form.team || undefined,
    location: form.location || undefined,
    headcount: form.headcount,
    compensation: form.compensation.min != null ? { min: form.compensation.min, max: form.compensation.max, currency: form.compensation.currency, equity: form.compensation.equity, bonus: form.compensation.bonus } : undefined,
    employmentType: form.employmentType || undefined,
    businessCase: form.businessCase || undefined,
    description: form.description || undefined,
    competencies: form.competencies.length > 0 ? form.competencies : undefined,
    mustHaves: form.mustHaves || undefined,
    niceToHaves: form.niceToHaves || undefined,
    interviewStages: form.interviewStages.length > 0
      ? form.interviewStages.map((s) => ({ name: s.name, interviewer: s.interviewer, durationMins: s.durationMins, competencies: s.competencies }))
      : undefined,
  };
}

/* -- Steps ----------------------------------------------------------- */

const STEPS = ["Basics", "Criteria", "Interview Plan", "Review"] as const;
type Step = (typeof STEPS)[number];

/* -- JD Upload Component --------------------------------------------- */

function JdUpload({ onExtracted, form }: { onExtracted: (data: Partial<RoleFormData>) => void; form: RoleFormData }) {
  const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "done" | "error">("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const MAX_FILE_SIZE_MB = 2;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  const processFile = useCallback(async (file: File) => {
    // Validate file size before processing
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileName(file.name);
      setStatus("error");
      setError(`File size exceeds ${MAX_FILE_SIZE_MB}MB limit. Please upload a smaller file.`);
      return;
    }

    setFileName(file.name);
    setStatus("uploading");
    setError(null);

    const formData = new FormData();
    formData.set("file", file);

    setStatus("processing");

    const result = await extractJd(formData);

    if (result.error) {
      setStatus("error");
      setError(result.error);
      return;
    }

    if (result.data) {
      setStatus("done");
      onExtracted(hydrateFromWizard(result.data, form));
    }
  }, [onExtracted, form]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

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
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Extracting role details, criteria, and interview plan
            </p>
          </div>
        </div>
        <div className="mt-3 h-1 rounded-full bg-amber-100 overflow-hidden">
          <div className="h-full rounded-full bg-amber-500 animate-pulse" style={{ width: "60%" }} />
        </div>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
              <Check className="h-3 w-3 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Populated from {fileName}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Review and edit the extracted fields below
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={reset} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </Button>
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

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        "rounded-xl border border-dashed p-5 transition-colors cursor-pointer",
        dragOver
          ? "border-primary bg-primary/5"
          : "border-border bg-card/50 hover:border-muted-foreground/30",
      )}
      onClick={() => fileInputRef.current?.click()}
    >
      <Input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.rtf,.md,.html"
        className="hidden"
        onChange={handleFileSelect}
      />
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
          <Upload className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-foreground">Upload a job description</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Drop a PDF or text file and the system will extract the role details, criteria, and suggest an interview plan. Max 2 MB.
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

/* -- Generating indicator -------------------------------------------- */

function GeneratingBar({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4">
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
        <p className="text-xs font-semibold text-foreground">{label}</p>
      </div>
      <div className="mt-2.5 h-1 rounded-full bg-amber-100 overflow-hidden">
        <div className="h-full rounded-full bg-amber-500 animate-pulse" style={{ width: "45%" }} />
      </div>
    </div>
  );
}

/* -- Props ----------------------------------------------------------- */

interface RoleWizardFormProps {
  /** Pre-populated form data (empty for new, hydrated for edit) */
  initialData: RoleFormData;
  /** Steps that are already complete (all for edit, none for new) */
  initialCompletedSteps: Set<Step>;
  /** Called on final submit with the form data */
  onSubmit: (data: RoleFormData) => Promise<void>;
  /** Page heading */
  heading: string;
  /** Subheading */
  subheading: string;
  /** Back link href */
  backHref: string;
  /** Back link label */
  backLabel: string;
  /** Submit button label */
  submitLabel: string;
  /** Submit button loading label */
  submittingLabel: string;
}

/* -- Component ------------------------------------------------------- */

export default function RoleWizardForm({
  initialData,
  initialCompletedSteps,
  onSubmit,
  heading,
  subheading,
  backHref,
  backLabel,
  submitLabel,
  submittingLabel,
}: RoleWizardFormProps) {
  const [currentStep, setCurrentStep] = useState<Step>("Basics");
  const [form, setForm] = useState<RoleFormData>(initialData);
  const [departments, setDepartments] = useState<string[]>([]);
  const [hiringManagers, setHiringManagers] = useState<{ id: string; name: string }[]>([]);
  const [recruiters, setRecruiters] = useState<{ id: string; name: string }[]>([]);
  // Active vendor partnerships, used to populate the exclusive-vendor picker.
  // Only standard-org admins can read this; on permission failure (vendor user
  // landing in this form somehow) the array stays empty and the picker is hidden.
  const [activeVendors, setActiveVendors] = useState<{ id: string; name: string }[]>([]);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(initialCompletedSteps);
  const [customTagFor, setCustomTagFor] = useState<number | null>(null);
  const stepIndex = STEPS.indexOf(currentStep);

  /** Mark a step as completed */
  const completeStep = (step: Step) =>
    setCompletedSteps((prev) => new Set(prev).add(step));

  /** Invalidate a step and all downstream steps */
  const invalidateFrom = (step: Step) => {
    const idx = STEPS.indexOf(step);
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      for (let i = idx; i < STEPS.length; i++) next.delete(STEPS[i]!);
      return next;
    });
  };

  useEffect(() => {
    listDepartments({ limit: 100 }).then(({ items: depts }) => setDepartments(depts.map((d: any) => d.name)));
    listMembers().then((members) => {
      setHiringManagers(
        members
          .filter((m: any) => m.recruitRole === "hiring_manager" || m.role === "owner")
          .map((m: any) => ({ id: m.userId, name: m.name })),
      );
      setRecruiters(
        members
          .filter((m: any) => m.recruitRole === "recruiter" || m.role === "owner")
          .map((m: any) => ({ id: m.userId, name: m.name })),
      );
    });
    fetchVendorPartnerships()
      .then(({ partnerships }) =>
        setActiveVendors(
          partnerships
            .filter((p) => p.status === "active")
            .map((p) => ({ id: p.vendorOrgId, name: p.vendorOrgName ?? p.vendorOrgId })),
        ),
      )
      .catch(() => {
        // Vendor users (or anyone without standard-org access) get an empty
        // list — the visibility selector still works for "internal".
      });
  }, []);

  // Only fields that change what competencies/requirements look like should invalidate criteria.
  // Logistical fields (location, compensation, headcount, etc.) don't affect evaluation criteria.
  const CRITERIA_INVALIDATING_FIELDS = new Set(["title", "description", "businessCase"]);
  const INTERVIEW_INVALIDATING_FIELDS = new Set(["competencies", "mustHaves", "niceToHaves"]);

  const updateField = <K extends keyof RoleFormData>(key: K, value: RoleFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (CRITERIA_INVALIDATING_FIELDS.has(key)) invalidateFrom("Criteria");
    else if (INTERVIEW_INVALIDATING_FIELDS.has(key)) invalidateFrom("Interview Plan");
  };

  const handleExtracted = useCallback((data: Partial<RoleFormData>) => {
    setForm((prev) => ({ ...prev, ...data }));
    // JD populated everything — mark all steps as completed
    setCompletedSteps(new Set(STEPS));
  }, []);

  const handleEnrichDetails = async () => {
    setEnriching(true);
    const baseContext = {
      title: form.title,
      team: form.team,
      location: form.location,
      department: form.department,
      employmentType: form.employmentType,
      headcount: form.headcount,
    };
    const [bcResult, descResult] = await Promise.all([
      form.businessCase
        ? enrichRoleField("businessCase", form.businessCase, { ...baseContext, description: form.description })
        : Promise.resolve({ enriched: null }),
      form.description
        ? enrichRoleField("description", form.description, { ...baseContext, businessCase: form.businessCase })
        : Promise.resolve({ enriched: null }),
    ]);
    if (bcResult.enriched) updateField("businessCase", bcResult.enriched);
    if (descResult.enriched) updateField("description", descResult.enriched);
    setEnriching(false);
  };

  const handleContinue = async () => {
    const nextStep = STEPS[stepIndex + 1];
    if (!nextStep) return;

    const fromStep = currentStep;

    // Mark current step as completed and advance immediately
    completeStep(currentStep);
    setCurrentStep(nextStep);

    // Generate downstream fields if the next step hasn't been completed yet.
    // Single call generates everything — criteria + interview plan together.
    // Skip entirely if downstream steps are already populated.
    const needsGeneration =
      !completedSteps.has(nextStep) &&
      form.title &&
      (fromStep === "Basics" || fromStep === "Criteria");

    if (needsGeneration) {
      setGenerating(true);
      const result = await generateRoleFields(formToWizardContext(form));
      if (result.data) {
        const patch = hydrateFromWizard(result.data, form);
        setForm((prev) => ({ ...prev, ...patch }));
        completeStep("Criteria");
        completeStep("Interview Plan");
      }
      setGenerating(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err) {
      console.error("Failed to submit role:", err);
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="space-y-8">
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
            <p className="mt-1 text-sm text-muted-foreground">
              {subheading}
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {STEPS.map((step, idx) => (
              <div key={step} className="flex items-center gap-2">
                <Button
                  variant="unstyled"
                  onClick={() => setCurrentStep(step)}
                  disabled={generating}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    idx === stepIndex && generating
                      ? "bg-amber-100 text-amber-700 border border-amber-200 animate-pulse"
                      : idx === stepIndex
                        ? "bg-primary text-primary-foreground"
                        : idx < stepIndex
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-secondary text-muted-foreground",
                  )}
                >
                  {generating && idx === stepIndex ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : idx < stepIndex ? (
                    <Check className="h-3 w-3" />
                  ) : null}
                  <span>{step}</span>
                </Button>
                {idx < STEPS.length - 1 && <div className="h-px w-6 bg-border" />}
              </div>
            ))}
          </div>

          {/* Generating overlay — shows on the step being computed */}
          {generating && (
            <GeneratingBar
              label={
                currentStep === "Criteria"
                  ? "Generating criteria and requirements..."
                  : currentStep === "Interview Plan"
                    ? "Generating interview plan..."
                    : "Generating..."
              }
            />
          )}

          {/* Step: Basics */}
          {currentStep === "Basics" && (
            <div className="space-y-6">
              <JdUpload onExtracted={handleExtracted} form={form} />

              <div className="rounded-xl border border-border bg-card p-6 space-y-5">
                <div>
                  <Label className="text-xs font-semibold text-foreground">Role title</Label>
                  <Input
                    type="text"
                    name="title"
                    placeholder="e.g. Founding Sales Manager"
                    value={form.title}
                    onChange={(e) => updateField("title", e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Department</Label>
                    <Select value={form.department} onValueChange={(v) => updateField("department", v)}>
                      <SelectTrigger className="mt-1.5 w-full">
                        <SelectValue placeholder="Select department..." />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Team</Label>
                    <Input
                      type="text"
                      placeholder="e.g. Platform, Growth"
                      value={form.team}
                      onChange={(e) => updateField("team", e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Hiring manager</Label>
                    <Select value={form.hiringManager} onValueChange={(v) => updateField("hiringManager", v)}>
                      <SelectTrigger className="mt-1.5 w-full">
                        <SelectValue placeholder="Select hiring manager..." />
                      </SelectTrigger>
                      <SelectContent>
                        {hiringManagers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Recruiter</Label>
                    <Select value={form.recruiter} onValueChange={(v) => updateField("recruiter", v)}>
                      <SelectTrigger className="mt-1.5 w-full">
                        <SelectValue placeholder="Select recruiter..." />
                      </SelectTrigger>
                      <SelectContent>
                        {recruiters.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Location</Label>
                    <Input
                      type="text"
                      placeholder="e.g. Nairobi / Remote"
                      value={form.location}
                      onChange={(e) => updateField("location", e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Headcount</Label>
                    <Input
                      type="number"
                      value={form.headcount}
                      min={1}
                      onChange={(e) => updateField("headcount", parseInt(e.target.value) || 1)}
                      className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Target hire date</Label>
                    <Input
                      type="date"
                      value={form.targetHireDate}
                      onChange={(e) => updateField("targetHireDate", e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <Label className="text-xs font-semibold text-foreground">Compensation range <span className="font-normal text-muted-foreground">(per year)</span></Label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Select
                        value={form.compensation.currency || "USD"}
                        onValueChange={(v) => updateField("compensation", { ...form.compensation, currency: v })}
                      >
                        <SelectTrigger className="w-20 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="GBP">GBP</SelectItem>
                          <SelectItem value="INR">INR</SelectItem>
                          <SelectItem value="KES">KES</SelectItem>
                          <SelectItem value="NGN">NGN</SelectItem>
                          <SelectItem value="ZAR">ZAR</SelectItem>
                          <SelectItem value="AED">AED</SelectItem>
                          <SelectItem value="SGD">SGD</SelectItem>
                          <SelectItem value="AUD">AUD</SelectItem>
                          <SelectItem value="CAD">CAD</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder="Min"
                        value={form.compensation.min ?? ""}
                        onChange={(e) => updateField("compensation", { ...form.compensation, min: e.target.value ? parseInt(e.target.value) : null })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 placeholder:italic focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="number"
                        placeholder="Max"
                        value={form.compensation.max ?? ""}
                        onChange={(e) => updateField("compensation", { ...form.compensation, max: e.target.value ? parseInt(e.target.value) : null })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 placeholder:italic focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Employment type</Label>
                    <Select value={form.employmentType || "Full-time"} onValueChange={(v) => updateField("employmentType", v)}>
                      <SelectTrigger className="mt-1.5 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Full-time">Full-time</SelectItem>
                        <SelectItem value="Contract">Contract</SelectItem>
                        <SelectItem value="Part-time">Part-time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Vendor visibility</Label>
                    <Select
                      value={form.vendorVisibility}
                      onValueChange={(v) => {
                        const next = v as RoleFormData["vendorVisibility"];
                        setForm((prev) => ({
                          ...prev,
                          vendorVisibility: next,
                          // Clear the picker when leaving "exclusive".
                          exclusiveVendorOrgId: next === "exclusive" ? prev.exclusiveVendorOrgId : null,
                        }));
                      }}
                    >
                      <SelectTrigger className="mt-1.5 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">Internal only</SelectItem>
                        <SelectItem value="all" disabled={activeVendors.length === 0}>
                          All partnered vendors{activeVendors.length === 0 ? " (no active partnerships)" : ""}
                        </SelectItem>
                        <SelectItem value="exclusive" disabled={activeVendors.length === 0}>
                          Exclusive to one vendor{activeVendors.length === 0 ? " (no active partnerships)" : ""}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Who outside your team can see this role and submit candidates.
                    </p>
                  </div>
                  {form.vendorVisibility === "exclusive" && (
                    <div>
                      <Label className="text-xs font-semibold text-foreground">Exclusive vendor</Label>
                      <Select
                        value={form.exclusiveVendorOrgId ?? ""}
                        onValueChange={(v) => updateField("exclusiveVendorOrgId", v || null)}
                      >
                        <SelectTrigger className="mt-1.5 w-full">
                          <SelectValue placeholder="Select vendor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {activeVendors.map((v) => (
                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-semibold text-foreground">Why are we hiring for this role?</Label>
                  <Textarea
                    rows={3}
                    placeholder="What's the business case? What problem does this hire solve?"
                    value={form.businessCase}
                    onChange={(e) => updateField("businessCase", e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-y min-h-[80px]"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">This helps the system understand the search context and improve candidate matching.</p>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-foreground">Role description</Label>
                  <Textarea
                    rows={5}
                    placeholder="What will this person do day to day? What does success look like?"
                    value={form.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-y min-h-[120px]"
                  />
                </div>
                {(form.businessCase || form.description) && (
                  <Button
                    type="button"
                    variant="unstyled"
                    onClick={handleEnrichDetails}
                    disabled={enriching}
                    className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-colors disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950/60"
                  >
                    {enriching ? (
                      <Loader2 size={15} className="shrink-0 animate-spin" />
                    ) : (
                      <Sparkles size={15} className="shrink-0" />
                    )}
                    {enriching ? "Enhancing..." : "Enhance descriptions with AI"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Step: Criteria */}
          {currentStep === "Criteria" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6 space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-xs font-semibold text-foreground">Competencies</Label>
                    <Button
                      variant="ghost"
                      onClick={() => updateField("competencies", [...form.competencies, { name: "", weight: "Required" }])}
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" />
                      Add competency
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {form.competencies.map((comp, idx) => (
                      <div key={idx} className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3">
                        <div className="flex-1">
                          <Input
                            type="text"
                            value={comp.name}
                            onChange={(e) => {
                              const next = [...form.competencies];
                              next[idx] = { ...next[idx]!, name: e.target.value };
                              updateField("competencies", next);
                            }}
                            className="w-full bg-transparent text-sm font-medium text-foreground focus:outline-none"
                          />
                        </div>
                        <Select
                          value={comp.weight || "Required"}
                          onValueChange={(v) => {
                            const next = [...form.competencies];
                            next[idx] = { ...next[idx]!, weight: v };
                            updateField("competencies", next);
                          }}
                        >
                          <SelectTrigger size="sm" className="w-auto text-[11px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Required">Required</SelectItem>
                            <SelectItem value="Preferred">Preferred</SelectItem>
                            <SelectItem value="Nice to have">Nice to have</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => updateField("competencies", form.competencies.filter((_, i) => i !== idx))}
                          className="text-muted-foreground/40 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {form.competencies.length === 0 && (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        No competencies yet. Add one above or upload a JD to auto-populate.
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-foreground">Must-have requirements</Label>
                  <Textarea
                    rows={3}
                    value={form.mustHaves}
                    onChange={(e) => updateField("mustHaves", e.target.value)}
                    placeholder="e.g. 5+ years enterprise sales experience"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-foreground">Nice-to-have</Label>
                  <Textarea
                    rows={2}
                    value={form.niceToHaves}
                    onChange={(e) => updateField("niceToHaves", e.target.value)}
                    placeholder="e.g. B2B SaaS background"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
              </div>

            </div>
          )}

          {/* Step: Interview Plan */}
          {currentStep === "Interview Plan" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-xs font-semibold text-foreground">Interview stages</Label>
                  <Button
                    variant="ghost"
                    onClick={() => updateField("interviewStages", [
                      ...form.interviewStages,
                      {
                        name: "",
                        interviewer: "",
                        durationMins: 30,
                        competencies: form.competencies.map((c) => c.name), // Auto-populate from role criteria
                        assessment: null
                      },
                    ])}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    Add stage
                  </Button>
                </div>
                <div className="space-y-3">
                  {form.interviewStages.map((stage, idx) => (
                    <div key={idx} className="rounded-xl border border-border bg-background p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                            {idx + 1}
                          </div>
                          <div className="flex-1 space-y-1.5">
                            <Input
                              type="text"
                              value={stage.name}
                              onChange={(e) => {
                                const updated = [...form.interviewStages];
                                updated[idx] = { ...stage, name: e.target.value };
                                updateField("interviewStages", updated);
                              }}
                              placeholder="Stage name"
                              className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-sm font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <div className="flex items-center gap-2">
                              <Input
                                type="text"
                                value={stage.interviewer}
                                onChange={(e) => {
                                  const updated = [...form.interviewStages];
                                  updated[idx] = { ...stage, interviewer: e.target.value };
                                  updateField("interviewStages", updated);
                                }}
                                placeholder="Interviewer"
                                className="flex-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  value={stage.durationMins}
                                  onChange={(e) => {
                                    const updated = [...form.interviewStages];
                                    updated[idx] = { ...stage, durationMins: parseInt(e.target.value) || 0 };
                                    updateField("interviewStages", updated);
                                  }}
                                  className="w-14 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <span className="text-xs text-muted-foreground">min</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => updateField("interviewStages", form.interviewStages.filter((_, i) => i !== idx))}
                          className="text-muted-foreground/40 hover:text-red-500 mt-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {stage.competencies.map((c, cidx) => (
                          <span key={`${idx}-${cidx}-${c}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {c}
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => {
                                const updated = [...form.interviewStages];
                                updated[idx] = { ...stage, competencies: stage.competencies.filter((comp) => comp !== c) };
                                updateField("interviewStages", updated);
                              }}
                              className="ml-0.5 hover:text-red-500 transition-colors"
                            >
                              <X className="h-2.5 w-2.5" />
                            </Button>
                          </span>
                        ))}
                        {stage.assessment && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-medium text-amber-700">
                            Auto-assign: {stage.assessment}
                          </span>
                        )}
                        {customTagFor === idx ? (
                          <Input
                            autoFocus
                            type="text"
                            placeholder="Type & press Enter"
                            className="rounded-full border border-primary bg-background px-2.5 py-0.5 text-[10px] font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none w-32"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                                const updated = [...form.interviewStages];
                                updated[idx] = { ...stage, competencies: [...stage.competencies, e.currentTarget.value.trim()] };
                                updateField("interviewStages", updated);
                                setCustomTagFor(null);
                              }
                              if (e.key === "Escape") setCustomTagFor(null);
                            }}
                            onBlur={() => setCustomTagFor(null)}
                          />
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                              >
                                <Plus className="h-2.5 w-2.5 inline -mt-px" /> Add
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {form.competencies
                                .filter((c) => !stage.competencies.includes(c.name))
                                .map((c) => (
                                  <DropdownMenuItem
                                    key={c.name}
                                    onSelect={() => {
                                      const updated = [...form.interviewStages];
                                      updated[idx] = { ...stage, competencies: [...stage.competencies, c.name] };
                                      updateField("interviewStages", updated);
                                    }}
                                  >
                                    {c.name}
                                  </DropdownMenuItem>
                                ))
                              }
                              <DropdownMenuItem onSelect={() => setCustomTagFor(idx)}>
                                + Custom...
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  ))}
                  {form.interviewStages.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No interview stages yet. Add one above or upload a JD to auto-populate.
                    </p>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* Step: Review */}
          {currentStep === "Review" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6 space-y-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Role</p>
                  <p className="text-sm font-semibold text-foreground">{form.title || "Untitled role"}</p>
                  <p className="text-xs text-muted-foreground">
                    {[form.team, form.location, formatCompensation(form.compensation) || null, `${form.headcount} hire${form.headcount > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {form.competencies.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Competencies</p>
                    <div className="flex flex-wrap gap-1.5">
                      {form.competencies.map((c, idx) => (
                        <span key={`${idx}-${c.name}`} className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">{c.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                {form.interviewStages.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Interview plan</p>
                    <p className="text-xs text-muted-foreground">
                      {form.interviewStages.length} stage{form.interviewStages.length > 1 ? "s" : ""}: {form.interviewStages.map((s) => s.name).join(" → ")}
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50/30 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[8px]">&#10022;</div>
                  <p className="text-xs font-semibold text-amber-900">What happens next</p>
                </div>
                <ul className="space-y-1.5 text-xs leading-relaxed text-foreground">
                  <li>The system will immediately begin matching candidates from selected pools against your criteria.</li>
                  <li>Matched candidates will appear on the Recommended tab for your review.</li>
                  <li>Inbound applications will be scored and ranked automatically.</li>
                  <li>Weekly coverage targets will be set based on your hiring timeline.</li>
                </ul>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Button
              variant="soft"
              onClick={() => stepIndex > 0 && setCurrentStep(STEPS[stepIndex - 1]!)}
              disabled={stepIndex === 0 || generating}
              className="rounded-lg px-4 py-2 text-xs disabled:opacity-30"
            >
              Back
            </Button>
            {stepIndex < STEPS.length - 1 ? (
              <Button
                onClick={handleContinue}
                disabled={generating}
                className="rounded-lg px-4 py-2 text-xs"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-3 w-3" />
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={submitting || !form.title}
                className="rounded-lg px-4 py-2 text-xs"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {submittingLabel}
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3" />
                    {submitLabel}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
