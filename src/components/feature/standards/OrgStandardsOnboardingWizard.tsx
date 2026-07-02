"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, FileText, Loader2, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";

import { completeOrgStandardsOnboardingAction } from "@/actions/standards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const requiredStandardFields = [
  {
    label: "Coding Standards",
    name: "codingStandardsBodyFile",
    fileName: "coding_instructions.md",
  },
  {
    label: "Brand Guidelines",
    name: "brandGuidelinesBodyFile",
    fileName: "brand_guidelines.md",
  },
  {
    label: "Architecture Principles",
    name: "architecturePrinciplesBodyFile",
    fileName: "architecture.md",
  },
] as const;

interface CustomStandardDraft {
  id: string;
  title: string;
  slug: string;
}

interface OrgStandardsOnboardingWizardProps {
  orgName: string;
  missingRequiredLabels: string[];
}

const initialOrgStandardsOnboardingState = {
  errors: [] as string[],
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Saving
        </>
      ) : (
        "Continue to Coznt"
      )}
    </Button>
  );
}

function FileDropBox({
  label,
  name,
  savedAsFileName,
  id,
  required,
}: {
  label: string;
  name: string;
  savedAsFileName?: string;
  id?: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = id ?? name;
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);

  function setFiles(files: FileList | null) {
    const file = files?.item(0);
    setFileName(file?.name ?? "");
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const files = event.dataTransfer.files;
          if (inputRef.current && files.length > 0) {
            inputRef.current.files = files;
            setFiles(files);
          }
        }}
        className={cn(
          "flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-sm border border-dashed bg-background px-4 py-5 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "hover:border-primary/60 hover:bg-secondary/40",
        )}
      >
        <Input
          ref={inputRef}
          id={inputId}
          name={name}
          type="file"
          accept=".md,.txt,text/markdown,text/plain"
          required={required}
          className="sr-only"
          onChange={(event) => setFiles(event.currentTarget.files)}
        />
        <span className="flex h-10 w-10 items-center justify-center rounded-sm border bg-muted">
          {fileName ? (
            <FileText className="h-5 w-5 text-primary" aria-hidden />
          ) : (
            <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
          )}
        </span>
        <span className="min-h-5 max-w-full truncate text-sm font-medium">
          {fileName || "Drop .md or .txt file"}
        </span>
        <span className="text-xs text-muted-foreground">
          {savedAsFileName ? `Saved as ${savedAsFileName}` : "Markdown or plain text, 2 MB max"}
        </span>
      </Label>
    </div>
  );
}

export function OrgStandardsOnboardingWizard({
  orgName,
  missingRequiredLabels,
}: OrgStandardsOnboardingWizardProps) {
  const [state, formAction] = useActionState(
    completeOrgStandardsOnboardingAction,
    initialOrgStandardsOnboardingState,
  );
  const [customStandards, setCustomStandards] = useState<CustomStandardDraft[]>([]);

  function addCustomStandard() {
    setCustomStandards((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        title: "",
        slug: "",
      },
    ]);
  }

  function updateCustomStandard(id: string, patch: Partial<CustomStandardDraft>) {
    setCustomStandards((items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (patch.title !== undefined && item.slug.trim().length === 0) {
          next.slug = slugify(patch.title);
        }
        return next;
      }),
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center">
        <form action={formAction} className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              {orgName}
            </div>
            <div className="max-w-3xl space-y-2">
              <h1 className="text-3xl font-semibold tracking-normal">Set organization standards</h1>
              <p className="text-sm leading-6 text-muted-foreground">
                Add the required org-scoped standards before using the workspace. Coznt stores these
                files verbatim and applies them across projects by default.
              </p>
            </div>
          </div>

          {missingRequiredLabels.length > 0 ? (
            <div className="rounded-sm border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              Missing: {missingRequiredLabels.join(", ")}
            </div>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-3">
            {requiredStandardFields.map((field) => (
              <FileDropBox
                key={field.name}
                label={field.label}
                name={field.name}
                savedAsFileName={field.fileName}
                required
              />
            ))}
          </section>

          <section className="space-y-3 border-t pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Additional org files</h2>
                <p className="text-xs text-muted-foreground">
                  Optional standards such as security, QA, accessibility, or procurement.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={addCustomStandard}>
                <Plus className="h-4 w-4" aria-hidden />
                Add file
              </Button>
            </div>

            {customStandards.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {customStandards.map((item, index) => (
                  <div key={item.id} className="space-y-3 rounded-sm border bg-card p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_180px_32px]">
                      <div className="space-y-1.5">
                        <Label htmlFor={`${item.id}-title`}>Title</Label>
                        <Input
                          id={`${item.id}-title`}
                          name="customStandardTitle"
                          value={item.title}
                          placeholder="Security Standard"
                          onChange={(event) =>
                            updateCustomStandard(item.id, { title: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`${item.id}-slug`}>Slug</Label>
                        <Input
                          id={`${item.id}-slug`}
                          name="customStandardSlug"
                          value={item.slug}
                          placeholder="security-standard"
                          onChange={(event) =>
                            updateCustomStandard(item.id, { slug: event.target.value })
                          }
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove additional standard ${index + 1}`}
                          onClick={() =>
                            setCustomStandards((items) =>
                              items.filter((standard) => standard.id !== item.id),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                    <FileDropBox
                      label="File"
                      name="customStandardFile"
                      id={`${item.id}-file`}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {(state?.errors?.length ?? 0) > 0 ? (
            <div className="space-y-1 rounded-sm border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {state.errors.map((error) => (
                <div key={error} className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex justify-end">
            <SubmitButton />
          </div>
        </form>
      </div>
    </main>
  );
}
