"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Briefcase, Check, MapPin, Sparkles, Upload } from "lucide-react";
import { completeOnboarding, uploadPortalResume } from "@/actions/portal";
import { Button } from "@/components/ui/button";
import { usePortalCandidate } from "../portal-candidate-context";

const SITUATIONS = [
  {
    id: "active",
    label: "Looking for my next role",
    description: "Match me to open roles that fit.",
  },
  {
    id: "exploring",
    label: "Just exploring",
    description: "Curious to see what's out there.",
  },
  {
    id: "student",
    label: "I'm a student",
    description: "Looking for internships or new-grad roles.",
  },
];

const FUNCTIONS = [
  "Software Engineering",
  "Product Management",
  "Design (UX/UI)",
  "Data / Analytics",
  "Marketing",
  "Sales",
  "Operations",
  "Customer Success",
  "Finance",
  "Other",
];

const LOCATIONS = [
  "Remote",
  "SF Bay Area",
  "NYC Metro",
  "Los Angeles",
  "Seattle",
  "Austin",
  "Boston",
  "Bengaluru",
  "Mumbai",
  "Delhi NCR",
  "London",
  "Berlin",
  "Open to anywhere",
];

export function WelcomeClient() {
  const router = useRouter();
  const candidate = usePortalCandidate();
  const [pending, startTransition] = useTransition();
  const [situation, setSituation] = useState<string>("active");
  const [functions, setFunctions] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [resumeUploaded, setResumeUploaded] = useState(candidate.hasResume);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const firstName = candidate.name.split(" ")[0] || "there";

  function toggle(values: string[], setValues: (v: string[]) => void, val: string) {
    setValues(values.includes(val) ? values.filter((v) => v !== val) : [...values, val]);
  }

  async function handleResume(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.set("resume", file);
      await uploadPortalResume(fd);
      setResumeUploaded(true);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function finish(skip: boolean) {
    startTransition(async () => {
      await completeOnboarding(
        skip
          ? {}
          : { situation, targetFunctions: functions, targetLocations: locations },
      );
      router.replace("/dashboard");
    });
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-12">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
            <Sparkles className="h-6 w-6 text-amber-600" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Welcome, {firstName}.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A few quick choices so we can match you to the right opportunities.
          </p>
        </div>

        {/* Step 1 — Situation */}
        <Step number={1} title="Where are you?">
          <div className="space-y-2">
            {SITUATIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSituation(s.id)}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${
                  situation === s.id
                    ? "border-amber-300 bg-amber-50/40"
                    : "border-border hover:border-amber-200"
                }`}
              >
                <p className="text-sm font-medium text-foreground">{s.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
              </button>
            ))}
          </div>
        </Step>

        {/* Step 2 — Resume */}
        <Step number={2} title="Add a resume" optional>
          {resumeUploaded ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <Check className="h-4 w-4 text-emerald-600" />
              <p className="text-sm text-foreground">Resume uploaded.</p>
            </div>
          ) : (
            <>
              <label
                className={`flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 transition-colors ${
                  uploading
                    ? "border-amber-300 bg-amber-50/40"
                    : "border-border hover:border-amber-200 hover:bg-amber-50/20"
                }`}
              >
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {uploading ? "Uploading..." : "Drop or click to upload your resume"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleResume(f);
                  }}
                />
              </label>
              {uploadError && (
                <p className="mt-2 text-xs text-rose-600">{uploadError}</p>
              )}
            </>
          )}
        </Step>

        {/* Step 3 — Preferences */}
        <Step number={3} title="What are you looking for?" optional>
          <div className="space-y-4">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Briefcase className="h-3.5 w-3.5" /> Functions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {FUNCTIONS.map((f) => (
                  <Chip
                    key={f}
                    label={f}
                    selected={functions.includes(f)}
                    onClick={() => toggle(functions, setFunctions, f)}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <MapPin className="h-3.5 w-3.5" /> Locations
              </p>
              <div className="flex flex-wrap gap-1.5">
                {LOCATIONS.map((l) => (
                  <Chip
                    key={l}
                    label={l}
                    selected={locations.includes(l)}
                    onClick={() => toggle(locations, setLocations, l)}
                  />
                ))}
              </div>
            </div>
          </div>
        </Step>

        {/* Footer */}
        <div className="mt-10 flex items-center justify-between">
          <button
            type="button"
            disabled={pending}
            onClick={() => finish(true)}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            Skip for now
          </button>
          <Button
            disabled={pending}
            onClick={() => finish(false)}
            className="gap-1.5"
          >
            {pending ? "Saving..." : "Continue"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  optional,
  children,
}: {
  number: number;
  title: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
          {number}
        </span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {optional && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Optional
          </span>
        )}
      </div>
      <div className="ml-8">{children}</div>
    </section>
  );
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        selected
          ? "border-amber-500 bg-amber-500 text-white"
          : "border-border bg-card hover:border-amber-200"
      }`}
    >
      {label}
    </button>
  );
}
