"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";

import {
  checkProjectSlugAvailability,
  createProjectAction,
  previewJiraProjectConnectionAction,
  type CreateProjectWizardInput,
} from "@/actions/project/projects";
import { REPOSITORY_SOURCES, type RepositorySource } from "@/db/schema/repository";
import { ENVIRONMENT_TIERS, type EnvironmentTier } from "@/db/schema/environment";
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

type StepId = 1 | 2 | 3;

interface EnvironmentDraft {
  enabled: boolean;
  name: string;
  tier: EnvironmentTier;
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
  repoSource: RepositorySource | "none";
  repoIdentifier: string;
  repoUrl: string;
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

const INITIAL_ENVIRONMENTS: EnvironmentDraft[] = [
  { enabled: true, name: "production", tier: "production" },
  { enabled: true, name: "development", tier: "development" },
  { enabled: false, name: "preproduction", tier: "preproduction" },
];

export interface NewProjectFormProps {
  approverCandidates: OrgMemberRow[];
}

export function NewProjectForm({ approverCandidates }: NewProjectFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<StepId>(1);
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
    repoSource: "none",
    repoIdentifier: "",
    repoUrl: "",
    environments: INITIAL_ENVIRONMENTS,
    criticalPathsText: "",
    productionCriticalPathsText: "",
    showAdvanced: false,
  });

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

    const payload: CreateProjectWizardInput = {
      name: form.name,
      slug: form.slug,
      description: form.description,
      approverIds: Array.from(form.approverIds),
      templateId: form.templateId,
      skipGovernance: form.skipGovernance,
      repository:
        form.repoSource !== "none" && form.repoIdentifier.trim().length > 0
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
          ) : (
            <SourcesStep
              form={form}
              setForm={setForm}
              setEnvironmentEnabled={setEnvironmentEnabled}
              setEnvironmentName={setEnvironmentName}
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
            {step < 3 ? (
              <Button
                type="button"
                onClick={() => setStep((s) => (s + 1) as StepId)}
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
    { id: 3, label: "Sources & environments" },
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

interface SourcesStepProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  setEnvironmentEnabled: (idx: number, enabled: boolean) => void;
  setEnvironmentName: (idx: number, name: string) => void;
}

function SourcesStep({
  form,
  setForm,
  setEnvironmentEnabled,
  setEnvironmentName,
}: SourcesStepProps) {
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
            onValueChange={(v) =>
              setForm((f) => ({ ...f, repoSource: v as RepositorySource | "none" }))
            }
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
          <Input
            placeholder={
              form.repoSource === "github"
                ? "owner/repo"
                : form.repoSource === "jira"
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
        </div>
        {form.repoSource === "github" ? (
          <Input
            placeholder="Optional canonical URL (https://github.com/owner/repo)"
            value={form.repoUrl}
            onChange={(e) => setForm((f) => ({ ...f, repoUrl: e.target.value }))}
          />
        ) : null}
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
