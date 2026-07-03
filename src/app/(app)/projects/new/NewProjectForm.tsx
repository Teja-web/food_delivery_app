"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  checkProjectSlugAvailability,
  createProjectAction,
  previewJiraProjectConnectionAction,
  type CreateProjectWizardInput,
} from "@/actions/project/projects";
import { REPOSITORY_SOURCES, type RepositorySource } from "@/db/schema/repository";
import { ENVIRONMENT_TIERS, type EnvironmentTier } from "@/db/schema/environment";
import { type ArtifactFileType, type RequiredOrganizationArtifactKey } from "@/db/schema/artifact";
import {
  DEFAULT_TEMPLATE_ID,
  POLICY_TEMPLATES,
} from "@/lib/governance/policy-templates";
import type { OrgMemberRow } from "@/operations/auth/members";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type StepId = 1 | 2 | 3 | 4;

interface EnvironmentDraft {
  enabled: boolean;
  name: string;
  tier: EnvironmentTier;
}

interface ProjectStandardUploadDraft {
  body: string;
  type: ArtifactFileType;
  sourceFileName: string;
}

interface ProjectCustomStandardDraft extends ProjectStandardUploadDraft {
  id: string;
  title: string;
}

export interface OrgStandardOption {
  id: string;
  requiredKey: RequiredOrganizationArtifactKey | null;
  title: string;
  type: ArtifactFileType;
  name: string;
  category: string | null;
  sourceFileName: string | null;
  updatedAt: string;
}

interface FormState {
  // Step 1
  name: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  // Step 2
  approverIds: Set<string>;
  templateId: string;
  skipGovernance: boolean;
  // Step 3
  useOrganizationArtifacts: boolean;
  selectedOrganizationArtifactIds: Set<string>;
  projectRequirements: ProjectStandardUploadDraft;
  projectDesign: ProjectStandardUploadDraft;
  projectCustomStandards: ProjectCustomStandardDraft[];
  // Step 4
  repoSource: RepositorySource | "none";
  repoIdentifier: string;
  repoUrl: string;
  githubRepositoryId: number | null;
  githubOwner: string;
  githubRepoName: string;
  githubCloneUrl: string;
  githubCreateNew: boolean;
  githubNewRepositoryName: string;
  environments: EnvironmentDraft[];
  criticalPathsText: string;
  productionCriticalPathsText: string;
  showAdvanced: boolean;
}

type SlugState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken" }
  | { kind: "invalid" };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitPaths(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function emptyStandardUpload(): ProjectStandardUploadDraft {
  return { body: "", type: ".md", sourceFileName: "" };
}

function emptyCustomProjectStandard(): ProjectCustomStandardDraft {
  return {
    id: crypto.randomUUID(),
    title: "",
    ...emptyStandardUpload(),
  };
}

function isAcceptedStandardFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".txt") ||
    file.type === "text/markdown" ||
    file.type === "text/plain" ||
    file.type === ""
  );
}

function artifactTypeFromFile(file: File): ArtifactFileType {
  const lower = file.name.toLowerCase();
  return lower.endsWith(".txt") || file.type === "text/plain" ? ".txt" : ".md";
}

function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

async function readStandardUpload(file: File): Promise<ProjectStandardUploadDraft> {
  if (!isAcceptedStandardFile(file)) {
    throw new Error("Upload a Markdown or text file.");
  }
  return {
    body: await file.text(),
    type: artifactTypeFromFile(file),
    sourceFileName: file.name,
  };
}

const INITIAL_ENVIRONMENTS: EnvironmentDraft[] = [
  { enabled: true, name: "production", tier: "production" },
  { enabled: true, name: "development", tier: "development" },
  { enabled: false, name: "preproduction", tier: "preproduction" },
];

export interface NewProjectFormProps {
  approverCandidates: OrgMemberRow[];
  orgStandards: OrgStandardOption[];
}

interface GitHubRepoOption {
  id: number;
  owner: string;
  repoName: string;
  fullName: string;
  cloneUrl: string;
}

interface GitHubProfile {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export function NewProjectForm({ approverCandidates, orgStandards }: NewProjectFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<StepId>(1);
  const [stepHydrated, setStepHydrated] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jiraCreatePrompt, setJiraCreatePrompt] = useState<{ key: string } | null>(null);
  const [slugState, setSlugState] = useState<SlugState>({ kind: "idle" });

  const [form, setForm] = useState<FormState>({
    name: "",
    slug: "",
    slugTouched: false,
    description: "",
    approverIds: new Set(),
    templateId: DEFAULT_TEMPLATE_ID,
    skipGovernance: false,
    useOrganizationArtifacts: false,
    selectedOrganizationArtifactIds: new Set(),
    projectRequirements: emptyStandardUpload(),
    projectDesign: emptyStandardUpload(),
    projectCustomStandards: [],
    repoSource: "none",
    repoIdentifier: "",
    repoUrl: "",
    githubRepositoryId: null,
    githubOwner: "",
    githubRepoName: "",
    githubCloneUrl: "",
    githubCreateNew: false,
    githubNewRepositoryName: "",
    environments: INITIAL_ENVIRONMENTS,
    criticalPathsText: "",
    productionCriticalPathsText: "",
    showAdvanced: false,
  });

  useEffect(() => {
    window.sessionStorage.removeItem("new-project-step");
    setStep(1);
    setStepHydrated(true);
  }, []);

  useEffect(() => {
    if (!stepHydrated) return;
    window.sessionStorage.setItem("new-project-step", String(step));
  }, [step, stepHydrated]);

  useEffect(() => {
    if (!form.slugTouched) {
      setForm((f) => ({ ...f, slug: slugify(form.name) }));
    }
  }, [form.name, form.slugTouched]);

  async function handleSlugBlur() {
    const trimmed = form.slug.trim();
    if (!trimmed) return setSlugState({ kind: "idle" });
    if (!/^[a-z0-9-]+$/.test(trimmed)) return setSlugState({ kind: "invalid" });
    setSlugState({ kind: "checking" });
    const { available, reason } = await checkProjectSlugAvailability(trimmed);
    if (available) setSlugState({ kind: "available" });
    else if (reason === "invalid") setSlugState({ kind: "invalid" });
    else setSlugState({ kind: "taken" });
  }

  const slugBlocksSubmit = slugState.kind === "taken" || slugState.kind === "invalid";

  const canAdvanceFromStep1 =
    form.name.trim().length > 0 && form.slug.trim().length > 0 && !slugBlocksSubmit;

  const canAdvanceFromStep2 = form.skipGovernance || form.approverIds.size > 0;


  function goToNextStep() {
    setSubmitError(null);
    setStep((s) => (s + 1) as StepId);
  }

  function toggleApprover(userId: string) {
    setForm((f) => {
      const next = new Set(f.approverIds);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return { ...f, approverIds: next };
    });
  }

  function setEnvironmentEnabled(idx: number, enabled: boolean) {
    setForm((f) => {
      const next = [...f.environments];
      next[idx] = { ...next[idx], enabled };
      return { ...f, environments: next };
    });
  }

  function setEnvironmentName(idx: number, name: string) {
    setForm((f) => {
      const next = [...f.environments];
      next[idx] = { ...next[idx], name };
      return { ...f, environments: next };
    });
  }

  function handleSubmit(createMissingJiraProject = false) {
    setSubmitError(null);
    setJiraCreatePrompt(null);
    if (!canAdvanceFromStep1) {
      setStep(1);
      return;
    }
    if (!canAdvanceFromStep2) {
      setStep(2);
      return;
    }

    const customArtifacts = [
      ...(form.projectRequirements.body.trim().length > 0
        ? [
            {
              kind: "requirements" as const,
              title: "Project Requirements",
              body: form.projectRequirements.body,
              type: form.projectRequirements.type,
              sourceFileName: form.projectRequirements.sourceFileName || undefined,
            },
          ]
        : []),
      ...(form.projectDesign.body.trim().length > 0
        ? [
            {
              kind: "design" as const,
              title: "Project Design",
              body: form.projectDesign.body,
              type: form.projectDesign.type,
              sourceFileName: form.projectDesign.sourceFileName || undefined,
            },
          ]
        : []),
      ...form.projectCustomStandards
        .map((item) => ({
          kind: "custom" as const,
          title: item.title.trim(),
          body: item.body,
          type: item.type,
          sourceFileName: item.sourceFileName || undefined,
        }))
        .filter((item) => item.title.length > 0 || item.body.trim().length > 0),
    ];

    const projectArtifacts = {
      selectedOrganizationArtifactIds: form.useOrganizationArtifacts
        ? Array.from(form.selectedOrganizationArtifactIds)
        : [],
      customArtifacts,
    };

    const payload: CreateProjectWizardInput = {
      name: form.name,
      slug: form.slug,
      description: form.description,
      approverIds: Array.from(form.approverIds),
      templateId: form.templateId,
      skipGovernance: form.skipGovernance,
      repository:
        form.repoSource === "github"
          ? form.githubCreateNew && form.githubNewRepositoryName.trim().length > 0
            ? {
                source: "github",
                createNewRepositoryName: form.githubNewRepositoryName.trim(),
              }
            : form.githubOwner.trim().length > 0 && form.githubRepoName.trim().length > 0
              ? {
                  source: "github",
                  githubRepositoryId: form.githubRepositoryId ?? undefined,
                  owner: form.githubOwner.trim(),
                  repoName: form.githubRepoName.trim(),
                  cloneUrl: form.githubCloneUrl.trim() || undefined,
                  identifier: form.repoIdentifier.trim() || undefined,
                  url: form.repoUrl.trim() || undefined,
                }
              : undefined
          : form.repoSource !== "none" && form.repoIdentifier.trim().length > 0
            ? {
                source: form.repoSource,
                identifier: form.repoIdentifier.trim(),
                url: form.repoUrl.trim() || undefined,
                createMissingJiraProject,
              }
            : undefined,
      environmentsToCreate: form.environments
        .filter((e) => e.enabled && e.name.trim().length > 0)
        .map((e) => ({ name: e.name.trim(), tier: e.tier })),
      criticalPaths: splitPaths(form.criticalPathsText),
      productionCriticalPaths: splitPaths(form.productionCriticalPathsText),
      projectArtifacts,
    };

    startTransition(async () => {
      if (
        payload.repository?.source === "jira" &&
        createMissingJiraProject !== true
      ) {
        try {
          const preview = await previewJiraProjectConnectionAction(payload.repository.identifier);
          if (!preview.exists) {
            setJiraCreatePrompt({ key: preview.key });
            return;
          }
        } catch (err) {
          setSubmitError(err instanceof Error ? err.message : "Jira project check failed.");
          return;
        }
      }

      const result = await createProjectAction(payload);
      if (result.ok) {
        router.push(`/projects/${result.id}/overview`);
        return;
      }
      setSubmitError(result.error);
      if (result.field === "slug") setSlugState({ kind: "taken" });
    });
  }

  return (
    <Card>
      <CardContent className="p-6">
        <StepIndicator step={step} />

        <div className="mt-6 space-y-5">
          {step === 1 ? (
            <BasicsStep
              form={form}
              setForm={setForm}
              slugState={slugState}
              setSlugState={setSlugState}
              onSlugBlur={handleSlugBlur}
            />
          ) : step === 2 ? (
            <GovernanceStep
              form={form}
              setForm={setForm}
              approverCandidates={approverCandidates}
              onToggleApprover={toggleApprover}
            />
          ) : step === 3 ? (
            <StandardsStep
              form={form}
              setForm={setForm}
              orgStandards={orgStandards}
            />
          ) : (
            <SourcesStep
              form={form}
              setForm={setForm}
              setEnvironmentEnabled={setEnvironmentEnabled}
              setEnvironmentName={setEnvironmentName}
              ensureSourcesStep={() => setStep(4)}
            />
          )}
        </div>

        {submitError ? (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        ) : null}

        {jiraCreatePrompt ? (
          <div className="mt-5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <div className="font-medium text-foreground">
              Create Jira project {jiraCreatePrompt.key}?
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Coznt could not find an existing Jira project or board for this key.
              Approving will create a Jira Software project named {form.name.trim()},
              then bind and sync it during project creation.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => handleSubmit(true)}
              >
                Approve creation
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setJiraCreatePrompt(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between border-t pt-5">
          <div className="flex items-center gap-2">
            {step > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((s) => (s - 1) as StepId)}
                disabled={pending}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push("/projects")}
                disabled={pending}
              >
                Cancel
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === 2 && !form.skipGovernance ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setForm((f) => ({ ...f, skipGovernance: true }))}
                disabled={pending}
              >
                Skip governance
              </Button>
            ) : null}
            {step < 4 ? (
              <Button
                type="button"
                onClick={goToNextStep}
                disabled={
                  pending ||
                  (step === 1 && !canAdvanceFromStep1) ||
                  (step === 2 && !canAdvanceFromStep2)
                }
              >
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={() => handleSubmit()} disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create project"
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step indicator

function StepIndicator({ step }: { step: StepId }) {
  const items: Array<{ id: StepId; label: string }> = [
    { id: 1, label: "Basics" },
    { id: 2, label: "Governance" },
    { id: 3, label: "Standards" },
    { id: 4, label: "Sources & environments" },
  ];
  return (
    <ol className="flex items-center gap-2 text-xs font-medium">
      {items.map((item, idx) => (
        <li key={item.id} className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border text-[11px]",
              item.id === step
                ? "border-foreground bg-foreground text-background"
                : item.id < step
                  ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-700"
                  : "border-muted-foreground/30 text-muted-foreground",
            )}
          >
            {item.id < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : item.id}
          </span>
          <span
            className={cn(
              "uppercase tracking-wider",
              item.id === step ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {item.label}
          </span>
          {idx < items.length - 1 ? (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 1 — Basics

interface BasicsStepProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  slugState: SlugState;
  setSlugState: (s: SlugState) => void;
  onSlugBlur: () => Promise<void>;
}

function BasicsStep({ form, setForm, slugState, setSlugState, onSlugBlur }: BasicsStepProps) {
  const slugErrored = slugState.kind === "taken" || slugState.kind === "invalid";
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          autoFocus
          required
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">Slug</Label>
        <div className="relative">
          <Input
            id="slug"
            value={form.slug}
            onChange={(e) => {
              setForm((f) => ({ ...f, slug: e.target.value, slugTouched: true }));
              setSlugState({ kind: "idle" });
            }}
            onBlur={onSlugBlur}
            required
            pattern="[a-z0-9-]+"
            autoComplete="off"
            className={cn(
              "pr-9",
              slugErrored && "border-destructive focus-visible:ring-destructive",
            )}
          />
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            {slugState.kind === "checking" ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : slugState.kind === "available" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : slugErrored ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : null}
          </div>
        </div>
        <p
          className={cn(
            "text-xs",
            slugErrored ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {slugState.kind === "taken"
            ? "That slug is already in use."
            : slugState.kind === "invalid"
              ? "Use lowercase letters, digits, and hyphens only."
              : "Used in URLs and the CLI. Lowercase, hyphens."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">
          Description{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={4}
          placeholder="One or two sentences. What is this project for?"
        />
        <p className="text-xs text-muted-foreground">
          The agent reads this on first context fetch and uses it to open the session.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 2 — Governance

interface GovernanceStepProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  approverCandidates: OrgMemberRow[];
  onToggleApprover: (userId: string) => void;
}

function GovernanceStep({
  form,
  setForm,
  approverCandidates,
  onToggleApprover,
}: GovernanceStepProps) {
  const noEligibleApprovers = approverCandidates.length === 0;
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="space-y-1">
          <Label>Approvers</Label>
          <p className="text-xs text-muted-foreground">
            Who can approve plans on this project? Pick from org admins/owners.
            Members without elevated roles can author plans but can&apos;t decide
            governance records.
          </p>
        </div>

        {noEligibleApprovers ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium">No eligible approvers in this org.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Promote at least one member to <code>admin</code> or{" "}
              <code>owner</code> in org settings, then come back. You can also
              skip governance for now and configure later.
            </p>
          </div>
        ) : (
          <div className="rounded-md border bg-card divide-y">
            {approverCandidates.map((m) => {
              const checked = form.approverIds.has(m.userId);
              return (
                <Label
                  key={m.userId}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40",
                    form.skipGovernance && "opacity-50",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggleApprover(m.userId)}
                    disabled={form.skipGovernance}
                  />
                  <div className="flex-1 text-sm">
                    <div>{m.userName ?? m.userEmail ?? m.userId}</div>
                    {m.userName && m.userEmail ? (
                      <div className="text-xs text-muted-foreground">{m.userEmail}</div>
                    ) : null}
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {m.role}
                  </span>
                </Label>
              );
            })}
          </div>
        )}

        {form.skipGovernance ? (
          <p className="text-xs text-amber-700">
            Governance skipped — plans will auto-approve. Configure later in
            Settings → Governance policies.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <Label>Starting template</Label>
          <p className="text-xs text-muted-foreground">
            Seed the project with a baseline policy set. Editable later.
          </p>
        </div>

        <RadioGroup
          value={form.templateId}
          onValueChange={(v) => setForm((f) => ({ ...f, templateId: v }))}
          className="space-y-2"
          disabled={form.skipGovernance}
        >
          {POLICY_TEMPLATES.map((t) => (
            <Label
              key={t.id}
              htmlFor={`tpl-${t.id}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3 hover:bg-muted/40",
                form.templateId === t.id && "border-foreground/40",
                form.skipGovernance && "opacity-50",
              )}
            >
              <RadioGroupItem
                id={`tpl-${t.id}`}
                value={t.id}
                className="mt-0.5"
                disabled={form.skipGovernance}
              />
              <div className="flex-1 text-sm">
                <div className="font-medium">{t.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t.description}
                </div>
              </div>
              {t.id === DEFAULT_TEMPLATE_ID ? (
                <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-700">
                  Recommended
                </span>
              ) : null}
            </Label>
          ))}
        </RadioGroup>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 3 — Sources & environments

interface StandardsStepProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  orgStandards: OrgStandardOption[];
}

function StandardsStep({ form, setForm, orgStandards }: StandardsStepProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const usingDefaults = form.useOrganizationArtifacts;
  const selectedDefaultCount = form.selectedOrganizationArtifactIds.size;
  const projectFilesReady =
    form.projectRequirements.body.trim().length > 0 &&
    form.projectDesign.body.trim().length > 0;

  async function applyCustomUpload(id: string, file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    try {
      const upload = await readStandardUpload(file);
      setForm((current) => ({
        ...current,
        projectCustomStandards: current.projectCustomStandards.map((item) =>
          item.id === id
            ? {
                ...item,
                ...upload,
                title: item.title.trim() || titleFromFileName(upload.sourceFileName),
              }
            : item,
        ),
      }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not read file.");
    }
  }

  async function applyProjectUpload(
    target: "requirements" | "design",
    file: File | undefined,
  ) {
    if (!file) return;
    setUploadError(null);
    try {
      const upload = await readStandardUpload(file);
      setForm((current) => ({
        ...current,
        [target === "requirements" ? "projectRequirements" : "projectDesign"]: upload,
      }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not read file.");
    }
  }

  function updateCustom(id: string, patch: Partial<ProjectCustomStandardDraft>) {
    setForm((current) => ({
      ...current,
      projectCustomStandards: current.projectCustomStandards.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  }

  function toggleOrganizationArtifact(id: string, checked: boolean) {
    setForm((current) => {
      const next = new Set(current.selectedOrganizationArtifactIds);
      if (checked) next.add(id);
      else next.delete(id);
      return { ...current, selectedOrganizationArtifactIds: next };
    });
  }

  function setUseOrganizationArtifacts(checked: boolean) {
    setUploadError(null);
    setForm((current) => ({
      ...current,
      useOrganizationArtifacts: checked,
      selectedOrganizationArtifactIds: checked
        ? new Set(orgStandards.map((artifact) => artifact.id))
        : new Set(),
      projectRequirements: checked ? emptyStandardUpload() : current.projectRequirements,
      projectDesign: checked ? emptyStandardUpload() : current.projectDesign,
    }));
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-md border bg-card p-4">
        <Label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            checked={usingDefaults}
            onCheckedChange={(value) => setUseOrganizationArtifacts(value === true)}
            className="mt-0.5"
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">
              Use default organization standards
            </span>
            <span className="block text-xs text-muted-foreground">
              Copies the files uploaded during organization setup into this project.
              This is off by default.
            </span>
          </span>
        </Label>

        {usingDefaults ? (
          <div className="space-y-3 border-t pt-3">
            <div className="text-xs text-muted-foreground">
              {selectedDefaultCount} default file{selectedDefaultCount === 1 ? "" : "s"} selected.
              Uncheck any file that should not be copied into this project.
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {orgStandards.map((artifact) => {
                const inputId = `artifact-${artifact.id}`;
                const checked = form.selectedOrganizationArtifactIds.has(artifact.id);
                return (
                  <Label
                    key={artifact.id}
                    htmlFor={inputId}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3 hover:bg-muted/40",
                      checked && "border-foreground/40",
                    )}
                  >
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      onCheckedChange={(value) =>
                        toggleOrganizationArtifact(artifact.id, value === true)
                      }
                      className="mt-0.5"
                    />
                    <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate font-medium">{artifact.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {artifact.sourceFileName ?? artifact.name}
                      </span>
                    </span>
                  </Label>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      <section
        className={cn(
          "space-y-3 rounded-md border p-4",
          usingDefaults ? "bg-muted/30 opacity-60" : "bg-card",
        )}
      >
        <div className="space-y-1">
          <Label>Project-exclusive files</Label>
          <p className="text-xs text-muted-foreground">
            Optional. Upload files now, select organization standards, or create them later through Coznt MCP:
            Requirements and Design.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <ProjectRequiredUpload
            label="Requirements"
            description="Project-specific requirements file."
            value={form.projectRequirements}
            disabled={usingDefaults}
            onUpload={(file) => applyProjectUpload("requirements", file)}
            onClear={() =>
              setForm((current) => ({ ...current, projectRequirements: emptyStandardUpload() }))
            }
          />
          <ProjectRequiredUpload
            label="Design"
            description="Project-specific design or architecture file."
            value={form.projectDesign}
            disabled={usingDefaults}
            onUpload={(file) => applyProjectUpload("design", file)}
            onClear={() =>
              setForm((current) => ({ ...current, projectDesign: emptyStandardUpload() }))
            }
          />
        </div>
        {!usingDefaults && !projectFilesReady ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700">
            Optional: upload Requirements/Design now, or create them later through Coznt MCP.
          </div>
        ) : null}
      </section>

      {usingDefaults ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <Label>Extra project files</Label>
              <p className="text-xs text-muted-foreground">
                Optional files to add on top of the copied default standards.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  projectCustomStandards: [
                    ...current.projectCustomStandards,
                    emptyCustomProjectStandard(),
                  ],
                }))
              }
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add extra file
            </Button>
          </div>

          {form.projectCustomStandards.length > 0 ? (
            <div className="space-y-3">
              {form.projectCustomStandards.map((standard) => (
                <div
                  key={standard.id}
                  className="grid gap-3 rounded-md border bg-card p-3 md:grid-cols-[1fr_auto_auto]"
                >
                  <Input
                    aria-label="Project artifact title"
                    placeholder="Title"
                    value={standard.title}
                    onChange={(event) =>
                      updateCustom(standard.id, { title: event.target.value })
                    }
                  />
                  <Label className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-sm border bg-background px-3 text-sm font-medium hover:bg-secondary">
                    <Upload className="h-3.5 w-3.5" aria-hidden />
                    {standard.sourceFileName || "Upload"}
                    <Input
                      type="file"
                      accept=".md,.markdown,.txt,text/markdown,text/plain"
                      className="sr-only"
                      onChange={(event) =>
                        void applyCustomUpload(standard.id, event.target.files?.[0])
                      }
                    />
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove project artifact"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        projectCustomStandards: current.projectCustomStandards.filter(
                          (item) => item.id !== standard.id,
                        ),
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {uploadError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {uploadError}
        </div>
      ) : null}
    </div>
  );
}

interface ProjectRequiredUploadProps {
  label: string;
  description: string;
  value: ProjectStandardUploadDraft;
  disabled: boolean;
  onUpload: (file: File | undefined) => void;
  onClear: () => void;
}

function ProjectRequiredUpload({
  label,
  description,
  value,
  disabled,
  onUpload,
  onClear,
}: ProjectRequiredUploadProps) {
  const inputId = `project-${label.toLowerCase()}-upload`;
  const hasFile = value.body.trim().length > 0;

  return (
    <div
      className={cn(
        "rounded-md border bg-background p-3",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{label}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          {hasFile ? (
            <div className="mt-2 rounded-md bg-muted/40 px-2.5 py-2 text-xs">
              <div className="truncate font-medium">{value.sourceFileName}</div>
              <div className="mt-0.5 text-muted-foreground">
                {value.type === ".txt" ? "Text" : "Markdown"} -{" "}
                {value.body.length.toLocaleString()} chars
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Label className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-sm border bg-background px-3 text-sm font-medium hover:bg-secondary">
          <Upload className="h-3.5 w-3.5" aria-hidden />
          {hasFile ? "Replace" : "Upload"}
          <Input
            id={inputId}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="sr-only"
            disabled={disabled}
            onChange={(event) => void onUpload(event.target.files?.[0])}
          />
        </Label>
        {hasFile ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={disabled}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface SourcesStepProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  setEnvironmentEnabled: (idx: number, enabled: boolean) => void;
  setEnvironmentName: (idx: number, name: string) => void;
  ensureSourcesStep: () => void;
}

function SourcesStep({
  form,
  setForm,
  setEnvironmentEnabled,
  setEnvironmentName,
  ensureSourcesStep,
}: SourcesStepProps) {
  const [githubRepos, setGithubRepos] = useState<GitHubRepoOption[]>([]);
  const [githubProfile, setGithubProfile] = useState<GitHubProfile | null>(null);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubLoadedOnce, setGithubLoadedOnce] = useState(false);

  async function fetchGitHubConnectionSnapshot(): Promise<
    | { connected: false; error?: string }
    | { connected: true; profile: GitHubProfile; repositories: GitHubRepoOption[] }
  > {
    const [profileResponse, reposResponse] = await Promise.all([
      fetch("/api/github/profile", { method: "GET" }),
      fetch("/api/github/repos", { method: "GET" }),
    ]);

    if (profileResponse.status === 401 || reposResponse.status === 401) {
      return { connected: false };
    }

    const profilePayload = (await profileResponse.json()) as {
      profile?: GitHubProfile;
      error?: string;
    };
    const reposPayload = (await reposResponse.json()) as {
      repositories?: GitHubRepoOption[];
      error?: string;
    };

    if (!profileResponse.ok) {
      return { connected: false, error: profilePayload.error || "Could not fetch GitHub profile." };
    }
    if (!reposResponse.ok) {
      return { connected: false, error: reposPayload.error || "Could not fetch GitHub repositories." };
    }
    if (!profilePayload.profile) {
      return { connected: false, error: "Could not fetch GitHub profile." };
    }

    return {
      connected: true,
      profile: profilePayload.profile,
      repositories: reposPayload.repositories ?? [],
    };
  }

  async function loadGitHubConnectionData(force = false) {
    if (!force && (githubLoadedOnce || githubLoading)) return;
    setGithubLoading(true);
    setGithubError(null);
    try {
      const snapshot = await fetchGitHubConnectionSnapshot();
      if (!snapshot.connected) {
        setGithubConnected(false);
        setGithubProfile(null);
        setGithubLoadedOnce(true);
        setGithubRepos([]);
        setGithubError(snapshot.error ?? null);
        return;
      }
      setGithubProfile(snapshot.profile);
      setGithubRepos(snapshot.repositories);
      setGithubConnected(true);
      setGithubLoadedOnce(true);
    } catch (err) {
      setGithubConnected(false);
      setGithubProfile(null);
      setGithubLoadedOnce(true);
      setGithubError(err instanceof Error ? err.message : "Could not fetch GitHub data.");
    } finally {
      setGithubLoading(false);
    }
  }

  useEffect(() => {
    if (form.repoSource === "github" && !githubLoadedOnce && !githubLoading) {
      void loadGitHubConnectionData();
    }
  }, [form.repoSource, githubLoadedOnce, githubLoading]);

  async function connectGitHub(opts: { switchAccount?: boolean } = {}) {
    setGithubError(null);
    setGithubLoading(true);
    try {
      const response = await fetch(
        opts.switchAccount ? "/api/github/auth/url?switch=1" : "/api/github/auth/url",
        { method: "GET" },
      );
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Could not start GitHub OAuth.");
      }

      const popup = window.open(
        payload.url,
        "github-oauth",
        "width=600,height=700,menubar=no,toolbar=no,status=no",
      );
      if (!popup) {
        throw new Error("Popup blocked. Please allow popups and try again.");
      }

      const result = await new Promise<{ status: "success" | "error"; error?: string }>((resolve) => {
        let settled = false;
        let closeCheckRunning = false;
        let messageArrived = false;
        const finish = (value: { status: "success" | "error"; error?: string }) => {
          if (settled) return;
          settled = true;
          window.clearInterval(timer);
          window.removeEventListener("message", onMessage);
          resolve(value);
        };

        const timer = window.setInterval(async () => {
          if (!popup.closed || settled || closeCheckRunning) return;
          closeCheckRunning = true;
          if (messageArrived) {
            finish({ status: "success" });
            return;
          }
          try {
            for (let i = 0; i < 5; i += 1) {
              const snapshot = await fetchGitHubConnectionSnapshot();
              if (snapshot.connected) {
                finish({ status: "success" });
                return;
              }
              await new Promise((r) => window.setTimeout(r, 250));
            }
            finish({ status: "error", error: "OAuth was cancelled." });
          } catch {
            finish({ status: "error", error: "OAuth was cancelled." });
          }
        }, 400);

        function onMessage(event: MessageEvent) {
          if (event.origin !== window.location.origin) return;
          const data = event.data as { type?: string; status?: "success" | "error"; error?: string };
          const success =
            data?.type === "github-oauth-success" ||
            (data?.type === "github-oauth" && data?.status === "success");
          const error =
            data?.type === "github-oauth-error" ||
            (data?.type === "github-oauth" && data?.status === "error");
          if (!success && !error) return;
          messageArrived = true;
          finish({ status: success ? "success" : "error", error: data.error });
        }

        window.addEventListener("message", onMessage);
      });

      if (result.status !== "success") {
        throw new Error(result.error || "GitHub authorization failed.");
      }

      ensureSourcesStep();
      setGithubError(null);
      setGithubLoadedOnce(false);
      await loadGitHubConnectionData(true);
      toast.success("GitHub account connected.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not connect GitHub.";
      setGithubError(message);
      toast.error(message);
    } finally {
      setGithubLoading(false);
    }
  }

  function clearGitHubSelection() {
    setForm((f) => ({
      ...f,
      repoIdentifier: "",
      repoUrl: "",
      githubRepositoryId: null,
      githubOwner: "",
      githubRepoName: "",
      githubCloneUrl: "",
      githubCreateNew: false,
      githubNewRepositoryName: "",
    }));
  }

  async function switchGitHubAccount() {
    setGithubError(null);
    setGithubLoading(true);
    try {
      // Clear local selection/cache first; OAuth callback upsert replaces server token.
      clearGitHubSelection();
      setGithubRepos([]);
      setGithubProfile(null);
      setGithubConnected(false);
      setGithubLoadedOnce(false);

      await connectGitHub({ switchAccount: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not switch GitHub account.";
      setGithubError(message);
      toast.error(message);
      setGithubLoadedOnce(false);
      void loadGitHubConnectionData(true);
      setGithubLoading(false);
    }
  }

  function applyGitHubRepoSelection(value: string) {
    if (value === "__create_new__") {
      setForm((f) => ({
        ...f,
        repoIdentifier: "",
        repoUrl: "",
        githubRepositoryId: null,
        githubOwner: "",
        githubRepoName: "",
        githubCloneUrl: "",
        githubCreateNew: true,
      }));
      return;
    }

    const selected = githubRepos.find((repo) => String(repo.id) === value);
    if (!selected) return;
    setForm((f) => ({
      ...f,
      repoIdentifier: `${selected.owner}/${selected.repoName}`,
      repoUrl: selected.cloneUrl,
      githubRepositoryId: selected.id,
      githubOwner: selected.owner,
      githubRepoName: selected.repoName,
      githubCloneUrl: selected.cloneUrl,
      githubCreateNew: false,
      githubNewRepositoryName: "",
    }));
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="space-y-1">
          <Label>Repository</Label>
          <p className="text-xs text-muted-foreground">
            Bind a code or tracker source. Connection (OAuth) finishes after
            create — for now we just record what to connect.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[160px,1fr]">
          <Select
            value={form.repoSource}
            onValueChange={(v) => {
              const nextSource = v as RepositorySource | "none";
              if (nextSource !== "github" && form.repoSource === "github") {
                clearGitHubSelection();
              }
              setForm((f) => ({ ...f, repoSource: nextSource }));
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Skip — connect later</SelectItem>
              {REPOSITORY_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.repoSource === "github" ? (
            !githubConnected ? (
              <Button type="button" variant="outline" onClick={() => void connectGitHub()} disabled={githubLoading}>
                {githubLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect GitHub"
                )}
              </Button>
            ) : (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex items-center gap-2">
                  {githubProfile?.avatarUrl ? (
                    <img
                      src={githubProfile.avatarUrl}
                      alt={`${githubProfile.login} avatar`}
                      className="h-7 w-7 rounded-full border"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full border bg-muted" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {githubProfile?.login ?? "Connected GitHub"}
                    </div>
                    {githubProfile?.name ? (
                      <div className="truncate text-xs text-muted-foreground">{githubProfile.name}</div>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={switchGitHubAccount}
                  disabled={githubLoading}
                >
                  {githubLoading ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Switching...
                    </>
                  ) : (
                    "Switch account"
                  )}
                </Button>
              </div>
            )
          ) : (
            <Input
              placeholder={
                form.repoSource === "jira"
                  ? "Jira project key (e.g. INGEST)"
                  : form.repoSource === "ado"
                    ? "ADO project id"
                    : form.repoSource === "confluence"
                      ? "Confluence space key"
                      : "Pick a source first"
              }
              value={form.repoIdentifier}
              onChange={(e) =>
                setForm((f) => ({ ...f, repoIdentifier: e.target.value }))
              }
              disabled={form.repoSource === "none"}
            />
          )}
        </div>
        {form.repoSource === "github" && githubConnected ? (
          githubLoading && githubRepos.length === 0 ? (
            <div className="flex h-10 items-center rounded-md border px-3 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading repositories...
            </div>
          ) : (
            <>
              <Select
                value={
                  form.githubCreateNew
                    ? "__create_new__"
                    : form.githubRepositoryId !== null
                      ? String(form.githubRepositoryId)
                      : ""
                }
                onValueChange={applyGitHubRepoSelection}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select repository" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__create_new__">+ Create New Repository</SelectItem>
                  {githubRepos.map((repo) => (
                    <SelectItem key={repo.id} value={String(repo.id)}>
                      {repo.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                If GitHub keeps authorizing the same account, sign out of github.com in this browser
                and click <span className="font-medium">Switch account</span> again.
              </p>
            </>
          )
        ) : null}
        {githubError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            {githubError}
          </div>
        ) : null}
        {form.repoSource === "github" && form.githubCreateNew ? (
          <Input
            placeholder="Repository Name"
            value={form.githubNewRepositoryName}
            onChange={(e) =>
              setForm((f) => ({ ...f, githubNewRepositoryName: e.target.value }))
            }
          />
        ) : null}
        {form.repoSource === "github" ? null : (
          <Input
            placeholder="Optional canonical URL"
            value={form.repoUrl}
            onChange={(e) => setForm((f) => ({ ...f, repoUrl: e.target.value }))}
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <Label>Environments</Label>
          <p className="text-xs text-muted-foreground">
            Deploy targets. Verification debt and per-environment governance
            both need these.
          </p>
        </div>

        <div className="rounded-md border bg-card divide-y">
          {form.environments.map((env, idx) => (
            <div key={env.tier} className="flex items-center gap-3 px-3 py-2">
              <Checkbox
                checked={env.enabled}
                onCheckedChange={(checked) => setEnvironmentEnabled(idx, Boolean(checked))}
              />
              <Input
                value={env.name}
                onChange={(e) => setEnvironmentName(idx, e.target.value)}
                disabled={!env.enabled}
                className="h-8 max-w-[200px]"
              />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {env.tier}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setForm((f) => ({ ...f, showAdvanced: !f.showAdvanced }))}
          className="h-auto gap-1.5 p-0 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          {form.showAdvanced ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Advanced — critical paths
        </Button>

        {form.showAdvanced ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Glob patterns. The change-risk classifier upgrades risk class when
              a PR touches any matching path.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="critical-paths" className="text-xs">
                Always-sensitive paths
              </Label>
              <Textarea
                id="critical-paths"
                value={form.criticalPathsText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, criticalPathsText: e.target.value }))
                }
                rows={3}
                placeholder={"src/auth/**\nsrc/payments/**"}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-critical-paths" className="text-xs">
                Production-only sensitive paths
              </Label>
              <Textarea
                id="prod-critical-paths"
                value={form.productionCriticalPathsText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, productionCriticalPathsText: e.target.value }))
                }
                rows={3}
                placeholder={"db/migrations/**\ninfra/**"}
                className="font-mono text-xs"
              />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

