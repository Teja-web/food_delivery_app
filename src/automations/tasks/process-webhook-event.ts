/**
 * Webhook event processor — runs in the worker against rows written by the
 * `/api/v1/webhooks/[source]` ingest endpoint.
 *
 * For each unprocessed `webhook_events` row we:
 *   1. Derive an `externalKey` from the payload (provider-specific).
 *   2. Resolve it to a coznt projectId via the AdapterBinding table.
 *   3. Fan out to a per-source handler (e.g. GitHub deployment_status →
 *      `recordDeployment`).
 *   4. Mark `processedAt`, or set `processingError` and leave for triage.
 *
 * Governance-refactor note: the prior implementation persisted execution-gate
 * verdicts to `gate_evaluations` and opened `approvals` rows. Both tables are
 * gone — autonomy gating now lives in the PreToolUse interceptor; PR-level
 * governance records are materialized by the policy engine on plan
 * transitions. Webhook handlers here are reduced to:
 *   - mirror upstream PRs/issues into `work_items`
 *   - record deployments and emit deploy-incident skill outcomes
 *   - fire the AI change-risk classifier (best-effort)
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deployments } from "@/db/schema/deployment";
import { projects } from "@/db/schema/project";
import { skills } from "@/db/schema/skill/skill";
import { projectTasks } from "@/db/schema/plan/project-task";
import { planRevisions } from "@/db/schema/plan/plan-revision";
import { comments } from "@/db/schema/plan/comment";
import { workItems } from "@/db/schema/work-item";
import { auditLogs } from "@/db/schema/audit/audit-log";
import { webhookEvents, type WebhookEvent } from "@/db/schema/audit/webhook-event";
import { assessDeployIncident } from "@/domain/outcomes";
import { resolveProjectForWebhook } from "@/lib/integrations/resolve";
import {
  attributeSkill,
  attributeSkillFromCommitSha,
} from "@/lib/integrations/skill-attribution";
import { classifyChangeRisk, type ChangedFile } from "@/domain/change-risk";
import { recordDeployment } from "@/operations/work/deployments";
import {
  recordAssessorOutcome,
  recomputeSkillAutonomy,
} from "@/operations/skill/skill-autonomy";
import { upsertWorkItem } from "@/operations/work/work-items";
import {
  jiraBrowseUrlFromIssueSelf,
  jiraExternalKeyFromParts,
} from "@/lib/integrations/jira-keys";
import { getJiraClient } from "@/lib/integrations/clients";
import { canonicalJiraStatus, mapCozntStatusToJira } from "@/lib/integrations/outbound";
import { runPrSummaryReviewTask } from "./pr-summary-review";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function markProcessed(eventId: string, error?: string): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date(), processingError: error ?? null })
    .where(eq(webhookEvents.id, eventId));
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function claimedPathFromMetadata(metadata: unknown): string | null {
  const source = asObject(asObject(metadata)?.source);
  const claimedPath = asString(source?.claimedPath);
  return claimedPath && claimedPath.length > 0 ? claimedPath : null;
}

async function runPrSummaryReviewForGitHubPr(
  evt: WebhookEvent,
  payload: Json,
  externalKey: string,
  projectId: string,
): Promise<void> {
  if (!evt.organizationId) return;
  const pr = asObject(payload.pull_request);
  if (!pr) return;
  const number = typeof pr.number === "number" ? pr.number : Number(pr.number);
  if (!Number.isFinite(number)) return;

  const installation = asObject(payload.installation);
  const installationId =
    asString(installation?.id) ??
    (installation?.id != null ? String(installation.id) : null);
  const ownerRepo = externalKey.replace(/^[^/]+\//, "");

  await runPrSummaryReviewTask({
    organizationId: evt.organizationId,
    projectId,
    ownerRepo,
    installationId,
    pullNumber: number,
    action: asString(payload.action) ?? null,
    draft: pr.draft === true,
    prTitle: asString(pr.title) ?? `PR #${number}`,
    prBody: asString(pr.body) ?? null,
    prUrl: asString(pr.html_url) ?? null,
    baseSha: asString(asObject(pr.base)?.sha) ?? null,
    headSha: asString(asObject(pr.head)?.sha) ?? null,
    webhookEventId: evt.id,
  });
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

/**
 * Build the AdapterBinding `externalKey` for a GitHub payload.
 * Format: `host/owner/repo` (e.g. `github.com/acme/api`). The host comes
 * from the webhook payload when available (GHE), falling back to `github.com`.
 */
function githubExternalKey(payload: Json): string | null {
  const repo = asObject(payload.repository);
  const fullName = asString(repo?.full_name);
  if (!fullName) return null;
  const htmlUrl = asString(repo?.html_url) ?? "";
  let host = "github.com";
  try {
    if (htmlUrl) host = new URL(htmlUrl).host;
  } catch {
    /* keep default */
  }
  return `${host}/${fullName}`;
}

/**
 * Mirror a GitHub PR into `work_items` so DORA + lead-time roll-ups flow off
 * GitHub the same way they already do off Jira/ADO.
 */
async function upsertGithubPrWorkItem(
  evt: WebhookEvent,
  payload: Json,
  externalKey: string,
  projectId: string,
): Promise<void> {
  if (!evt.organizationId) return;
  const pr = asObject(payload.pull_request);
  if (!pr) return;
  const number = typeof pr.number === "number" ? pr.number : Number(pr.number);
  if (!Number.isFinite(number)) return;

  const state = asString(pr.state);
  const merged = pr.merged === true;
  const status = state === "closed" ? (merged ? "merged" : "closed") : (state ?? "open");
  const ownerRepo = externalKey.replace(/^[^/]+\//, "");
  const externalId = `github:${ownerRepo}#${number}`;

  try {
    await upsertWorkItem({
      organizationId: evt.organizationId,
      projectId,
      source: "github",
      externalId,
      externalUrl: asString(pr.html_url),
      kind: "pull_request",
      title: asString(pr.title) ?? `PR #${number}`,
      description: asString(pr.body) ?? undefined,
      status,
      raw: payload,
    });
  } catch {
    /* swallow — observability path; gate evaluation no longer runs here */
  }
}

async function handleGitHub(evt: WebhookEvent): Promise<void> {
  if (!evt.organizationId) {
    return markProcessed(evt.id, "webhook has no organizationId");
  }
  const payload = asObject(evt.payload) ?? {};
  const externalKey = githubExternalKey(payload);
  if (!externalKey) {
    return markProcessed(evt.id, "github payload missing repository.full_name");
  }

  const projectId = await resolveProjectForWebhook(evt.organizationId, "github", externalKey);
  if (!projectId) {
    return markProcessed(evt.id, `no project binding for ${externalKey}`);
  }

  // Default-branch push: re-sync .agents/* files into DB per
  // docs/spec/dev-authoring-surface.md §10. We run sync regardless of
  // commit author — merges to default branch are the apply event.
  if (evt.event === "push") {
    await runMergeSyncForPush(evt, payload, externalKey, projectId);
    return markProcessed(evt.id);
  }

  if (evt.event === "deployment_status") {
    const deployStatus = asObject(payload.deployment_status);
    const state = asString(deployStatus?.state);
    if (state !== "success" && state !== "failure") {
      return markProcessed(evt.id);
    }

    const deployment = asObject(payload.deployment);
    const environment = asString(deployment?.environment) ?? "production";
    const version =
      asString(deployment?.sha)?.slice(0, 12) ??
      asString(deployment?.ref) ??
      "unknown";
    const commitSha = asString(deployment?.sha);
    const ciRunUrl = asString(deployStatus?.target_url) ?? asString(deployStatus?.log_url);

    try {
      const recorded = await recordDeployment({
        projectId,
        environment,
        version,
        commitSha,
        status: state === "success" ? "success" : "failed",
        ciRunUrl,
        raw: payload,
        completedAt: new Date(),
      });

      if (state === "failure" && commitSha) {
        const installation = asObject(payload.installation);
        const installationId =
          asString(installation?.id) ??
          (installation?.id != null ? String(installation.id) : null);
        await emitDeployIncidentOutcome({
          organizationId: evt.organizationId,
          projectId,
          deploymentId: recorded.id,
          environment,
          completedAt: recorded.completedAt,
          rolledBackAt: recorded.rolledBackAt,
          status: "failed",
          commitSha,
          ownerRepo: externalKey.replace(/^[^/]+\//, ""),
          installationId,
        });
      }
      return markProcessed(evt.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return markProcessed(evt.id, `recordDeployment failed: ${msg}`);
    }
  }

  if (evt.event === "pull_request") {
    // Mirror the PR into work_items so DORA / lead-time can roll up.
    await upsertGithubPrWorkItem(evt, payload, externalKey, projectId);

    const action = asString(payload.action);

    // PR-lifecycle status derivation for file-claimed project tasks per
    // docs/spec/dev-authoring-surface.md §9. open/synchronize/labeled trigger
    // status transitions on plans touched by the PR; closed-unmerged → cancelled
    // (or rejected per repo config); merged is handled by the push path.
    await runPrLifecycleForPlans(evt, payload, externalKey, projectId).catch(() => {
      /* lifecycle is observability-grade; swallow */
    });

    // Preview-mode sync: emit check-run summary of what would change on merge.
    if (action === "opened" || action === "synchronize" || action === "reopened" || action === "ready_for_review") {
      await runMergeSyncPreviewForPr(evt, payload, externalKey, projectId).catch(() => {
        /* preview is best-effort */
      });
    }

    const triggers = new Set(["opened", "synchronize", "reopened", "edited", "ready_for_review"]);
    if (!action || !triggers.has(action)) {
      return markProcessed(evt.id);
    }
    await runPrSummaryReviewForGitHubPr(evt, payload, externalKey, projectId).catch(() => {
      /* Coznt Cat summary is observability-grade; failures are logged by the task. */
    });
    return runChangeRiskClassifier(evt, payload, externalKey, projectId);
  }

  return markProcessed(evt.id);
}

// ---------------------------------------------------------------------------
// .agents/* merge-webhook sync — wires the three sync tasks into push events
// and PR-preview check-runs per docs/spec/dev-authoring-surface.md §10, §13.
// ---------------------------------------------------------------------------

async function runMergeSyncForPush(
  evt: WebhookEvent,
  payload: Json,
  externalKey: string,
  projectId: string,
): Promise<void> {
  if (!evt.organizationId) return;
  const repo = asObject(payload.repository);
  const defaultBranch = asString(repo?.default_branch) ?? "main";
  const ref = asString(payload.ref);
  if (!ref || ref !== `refs/heads/${defaultBranch}`) return;

  const headSha = asString(payload.after);
  if (!headSha) return;

  const installation = asObject(payload.installation);
  const installationId =
    asString(installation?.id) ??
    (installation?.id != null ? String(installation.id) : null);
  if (!installationId) return;

  const ownerRepo = externalKey.replace(/^[^/]+\//, "");

  // The push payload's head_commit message often carries the merged PR number
  // via "(#1234)" appended by GitHub's merge button. Use it to fetch the PR
  // and surface its pre-approval comments for §13 short-circuit routing.
  const headCommit = asObject(payload.head_commit);
  const headMessage = asString(headCommit?.message) ?? "";
  const prNumberMatch = headMessage.match(/\(#(\d+)\)/);
  const mergedPrNumber = prNumberMatch ? Number(prNumberMatch[1]) : null;
  const preApprovedSlugs = new Set<string>();
  if (mergedPrNumber) {
    try {
      const { listPullRequestComments } = await import("@/lib/integrations/github-app");
      const comments = await listPullRequestComments({
        installationId,
        ownerRepo,
        pullNumber: mergedPrNumber,
      });
      const { parseApprovalComments } = await import("./lib/preapprove-comments");
      for (const approval of parseApprovalComments(comments)) {
        preApprovedSlugs.add(approval.slug);
      }
    } catch {
      /* pre-approvals are best-effort */
    }
  }

  // Late-import so test/CI builds without GitHub App config don't pull in
  // the full sync chain on cold worker start.
  const [
    { syncSkillsFromMerge },
    { syncRulesFromMerge },
    { syncPlansFromMerge },
  ] = await Promise.all([
    import("./sync-skills-from-merge"),
    import("./sync-rules-from-merge"),
    import("./sync-plans-from-merge"),
  ]);

  const ctx = {
    organizationId: evt.organizationId,
    projectId,
    installationId,
    ownerRepo,
    ref: headSha,
    prNumber: mergedPrNumber,
    preview: false,
    preApprovedSlugs,
  };

  // Apply per artifact. Errors per-artifact don't roll back others — each
  // produces its own audit_logs rows via the sync helpers.
  const [skillResult, ruleResult, planResult] = await Promise.all([
    syncSkillsFromMerge(ctx).catch((err) => ({ applied: [], parseErrors: [{ path: "<sync-skills>", message: String(err) }] })),
    syncRulesFromMerge(ctx).catch((err) => ({ applied: [], parseErrors: [{ path: "<sync-rules>", message: String(err) }] })),
    syncPlansFromMerge(ctx).catch((err) => ({ applied: [], parseErrors: [{ path: "<sync-plans>", message: String(err) }], unresolvedRelationships: [] })),
  ]);

  // Mark PR-derived plan transitions if the push came from a merge commit.
  // The push payload carries `head_commit.message`; we extract any PR refs
  // via PR-lifecycle handler (handled via the pull_request event already,
  // but we'd see the merge there as `closed` + merged=true). No-op here.

  // Post a check-run summarizing what changed (when GitHub App is configured).
  try {
    const { postCheckRun } = await import("@/lib/integrations/github-app");
    const summary = formatMergeSummary({ skillResult, ruleResult, planResult });
    if (summary) {
      await postCheckRun({
        installationId,
        ownerRepo,
        headSha,
        name: "coznt / merge sync",
        conclusion: hasErrors(skillResult, ruleResult, planResult) ? "neutral" : "success",
        title: "Coznt — applied",
        summary,
      });
    }
  } catch {
    /* check-run is best-effort */
  }
}

async function runMergeSyncPreviewForPr(
  evt: WebhookEvent,
  payload: Json,
  externalKey: string,
  projectId: string,
): Promise<void> {
  if (!evt.organizationId) return;
  const pr = asObject(payload.pull_request);
  const headSha = asString(asObject(pr?.head)?.sha);
  if (!headSha) return;

  const installation = asObject(payload.installation);
  const installationId =
    asString(installation?.id) ??
    (installation?.id != null ? String(installation.id) : null);
  if (!installationId) return;

  const ownerRepo = externalKey.replace(/^[^/]+\//, "");
  const prNumber = typeof pr?.number === "number" ? pr.number : Number(pr?.number);

  const [
    { syncSkillsFromMerge },
    { syncRulesFromMerge },
    { syncPlansFromMerge },
  ] = await Promise.all([
    import("./sync-skills-from-merge"),
    import("./sync-rules-from-merge"),
    import("./sync-plans-from-merge"),
  ]);

  const ctx = {
    organizationId: evt.organizationId,
    projectId,
    installationId,
    ownerRepo,
    ref: headSha,
    prNumber: Number.isFinite(prNumber) ? prNumber : null,
    preview: true,
  };

  const [skillResult, ruleResult, planResult] = await Promise.all([
    syncSkillsFromMerge(ctx),
    syncRulesFromMerge(ctx),
    syncPlansFromMerge(ctx),
  ]);

  // PR authoring preview is intentionally internal-only. Do not publish a
  // GitHub Check Run for it; Coznt Cat summaries are posted as PR comments.
}

interface MergeSummaryInputs {
  skillResult: Awaited<ReturnType<typeof import("./sync-skills-from-merge").syncSkillsFromMerge>>;
  ruleResult: Awaited<ReturnType<typeof import("./sync-rules-from-merge").syncRulesFromMerge>>;
  planResult: Awaited<ReturnType<typeof import("./sync-plans-from-merge").syncPlansFromMerge>>;
  preview?: boolean;
}

function hasErrors(
  skillResult: MergeSummaryInputs["skillResult"],
  ruleResult: MergeSummaryInputs["ruleResult"],
  planResult: MergeSummaryInputs["planResult"],
): boolean {
  return (
    skillResult.parseErrors.length > 0 ||
    ruleResult.parseErrors.length > 0 ||
    planResult.parseErrors.length > 0
  );
}

function formatMergeSummary(inputs: MergeSummaryInputs): string {
  const { skillResult, ruleResult, planResult, preview } = inputs;
  const lines: string[] = [];
  if (skillResult.applied.length > 0) {
    lines.push("**Skills changing on merge:**");
    for (const d of skillResult.applied) {
      const marker = d.op === "added" ? "+" : d.op === "removed" ? "-" : "~";
      const route =
        d.routedTo === "direct" ? "auto-apply" : `requires ${d.routedTo}`;
      lines.push(`  ${marker} ${d.slug} (${d.op}, ${d.reason}) → ${route}`);
    }
  }
  if (ruleResult.applied.length > 0) {
    lines.push("");
    lines.push("**Rules changing on merge:**");
    for (const d of ruleResult.applied) {
      const marker = d.op === "added" ? "+" : d.op === "removed" ? "-" : "~";
      const route =
        d.routedTo === "direct" ? "auto-apply" : `requires ${d.routedTo}`;
      lines.push(`  ${marker} ${d.slug} (${d.op}, ${d.reason}) → ${route}`);
    }
  }
  if (planResult.applied.length > 0) {
    lines.push("");
    lines.push("**Plans changing on merge:**");
    for (const d of planResult.applied) {
      const marker = d.op === "added" ? "+" : d.op === "removed" ? "-" : "~";
      lines.push(`  ${marker} ${d.kind}/${d.slug} (${d.op})`);
    }
  }
  if (
    skillResult.parseErrors.length +
      ruleResult.parseErrors.length +
      planResult.parseErrors.length >
    0
  ) {
    lines.push("");
    lines.push("**Frontmatter errors:**");
    for (const e of [
      ...skillResult.parseErrors,
      ...ruleResult.parseErrors,
      ...planResult.parseErrors,
    ]) {
      lines.push(`  - ${e.path}: ${e.message}`);
    }
  }
  if (planResult.unresolvedRelationships.length > 0) {
    lines.push("");
    lines.push("**Unresolved relationship targets:**");
    for (const r of planResult.unresolvedRelationships) {
      lines.push(`  - ${r.kind} → ${r.to} (target not found)`);
    }
  }
  if (lines.length === 0) {
    return preview ? "_No `.agents/` changes in this PR._" : "";
  }
  return lines.join("\n");
}

/**
 * Map PR events to plan status transitions for file-claimed plans per §9.
 *   PR opened/synchronize on a branch touching a `.agents/plans/<kind>/*.md`
 *     file → that plan moves to `in_review` if currently `draft`.
 *   PR closed-unmerged → `cancelled` (or `rejected` per coznt.yaml).
 *   PR merged is handled by the push path (status → `approved` when the
 *     spec body is now on default branch).
 * MVP: we only re-evaluate on every relevant PR event; we don't track
 * which PR owns which plan (since multiple PRs can touch the same file
 * concurrently, and the spec leaves this as v1.1 work — see §21).
 */
async function runPrLifecycleForPlans(
  evt: WebhookEvent,
  payload: Json,
  externalKey: string,
  projectId: string,
): Promise<void> {
  if (!evt.organizationId) return;
  const pr = asObject(payload.pull_request);
  const action = asString(payload.action);
  const merged = pr?.merged === true;
  const state = asString(pr?.state);
  if (!action) return;

  const installation = asObject(payload.installation);
  const installationId =
    asString(installation?.id) ??
    (installation?.id != null ? String(installation.id) : null);
  if (!installationId) return;

  const headSha = asString(asObject(pr?.head)?.sha);
  if (!headSha) return;

  const ownerRepo = externalKey.replace(/^[^/]+\//, "");
  const prNumber = typeof pr?.number === "number" ? pr.number : Number(pr?.number);
  if (!Number.isFinite(prNumber)) return;

  // Determine target status from PR event.
  let target: "in_review" | "changes_requested" | "cancelled" | "rejected" | null = null;
  if (action === "opened" || action === "synchronize" || action === "reopened") {
    target = "in_review";
  } else if (
    action === "labeled" &&
    asString(asObject(payload.label)?.name) === "coznt:changes-requested"
  ) {
    target = "changes_requested";
  } else if (action === "closed" && state === "closed" && !merged) {
    // Default cancelled; loader can override to rejected.
    target = "cancelled";
  }
  if (!target) return;

  // Find file-claimed plans matching paths in this PR.
  const { listFilesForPr } = await import("@/lib/integrations/github-app");
  const candidates = await db.query.projectTasks.findMany({
    where: and(
      eq(projectTasks.organizationId, evt.organizationId),
      eq(projectTasks.projectId, projectId),
    ),
    columns: { id: true, status: true, metadata: true, kind: true, slug: true },
  });
  const claimed = candidates
    .map((p) => ({ ...p, claimedPath: claimedPathFromMetadata(p.metadata) }))
    .filter((p) => p.claimedPath);
  if (claimed.length === 0) return;

  let paths: Set<string> | null = null;
  try {
    const filePaths = await listFilesForPr({
      installationId,
      ownerRepo,
      pullNumber: prNumber,
    });
    paths = new Set(filePaths);
  } catch {
    /* fall through to scanning all file-claimed plans (cheap for typical projects) */
  }

  for (const plan of claimed) {
    if (!plan.claimedPath) continue;
    if (paths && !paths.has(plan.claimedPath)) continue;

    const allowed = nextStatusAllowed(plan.status, target);
    if (!allowed) continue;
    await db
      .update(projectTasks)
      .set({ status: target, updatedAt: new Date() })
      .where(eq(projectTasks.id, plan.id));
    // Materialize governance_records on the transition.
    try {
      const { materializeGovernanceRecords } = await import(
        "@/operations/governance/records"
      );
      await materializeGovernanceRecords({
        projectTaskId: plan.id,
        transitionFrom: plan.status,
        transitionTo: target,
      });
    } catch {
      /* materialize is best-effort here; the web app retry handles re-attempts */
    }
  }
}

function nextStatusAllowed(
  from: string,
  to: "in_review" | "changes_requested" | "cancelled" | "rejected",
): boolean {
  // Conservative: only allow the transitions §9 lists. Other paths flow
  // through the web app's planCrud, which performs its own validation.
  if (to === "in_review") return from === "draft" || from === "changes_requested";
  if (to === "changes_requested") return from === "in_review";
  if (to === "cancelled" || to === "rejected") return from !== "approved" && from !== "completed";
  return false;
}

/**
 * Best-effort: classify a PR via the AI change-risk classifier and write
 * its result to `intelligence`. The deterministic execution gate path
 * (gate_evaluations writes, GitHub check-run posting) was removed in the
 * governance refactor — the autonomy gate now ships via PreToolUse on the
 * agent side, not on webhook receive.
 */
async function runChangeRiskClassifier(
  evt: WebhookEvent,
  payload: Json,
  externalKey: string,
  projectId: string,
): Promise<void> {
  if (!evt.organizationId) {
    return markProcessed(evt.id, "webhook has no organizationId");
  }
  const pr = asObject(payload.pull_request);
  if (!pr) return markProcessed(evt.id, "pull_request payload missing");

  const number = typeof pr.number === "number" ? pr.number : Number(pr.number);
  if (!Number.isFinite(number)) return markProcessed(evt.id, "pull_request missing number");

  const ownerRepo = externalKey.replace(/^[^/]+\//, "");
  const prRef = `github:${ownerRepo}#${number}`;
  const prTitle = asString(pr.title) ?? null;
  const prBody = asString(pr.body) ?? null;

  // Skill attribution for telemetry (kept available even though we no longer
  // persist a gate_evaluation row that carries it).
  const commits = Array.isArray(payload.commits)
    ? (payload.commits as Json[]).map((c) => ({
        message: asString(c.message) ?? "",
        sha: asString(c.id),
      }))
    : [];
  const skillSlug = attributeSkill(commits, prBody);

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, evt.organizationId)),
  });
  if (!project) return markProcessed(evt.id, "project not found");

  const files: ChangedFile[] = await fetchChangedFiles(payload);
  const risk = classifyChangeRisk({
    files,
    criticalPaths: project.criticalPaths ?? [],
    productionCriticalPaths: project.productionCriticalPaths ?? [],
  });

  try {
    const { classifyChangeRiskTask } = await import("./classify-change-risk");
    await classifyChangeRiskTask({
      organizationId: evt.organizationId,
      projectId,
      projectName: project.name,
      // Project phase is gone in the new schema; pass "n/a" so the prompt
      // template still renders without an undefined.
      projectPhase: "n/a",
      prRef,
      prTitle: prTitle ?? `PR #${number}`,
      prBody,
      files,
      totalLines: risk.totalLines,
      criticalPaths: project.criticalPaths ?? [],
      productionCriticalPaths: project.productionCriticalPaths ?? [],
      heuristicRisk: risk.risk,
      // Active-rule violation surfacing also moved off this path — pass
      // the (now unused) skill attribution slug as a single info breadcrumb.
      activeRules: skillSlug ? [`attributed-skill:${skillSlug}`] : [],
    });
  } catch {
    // swallow — AI is observability, not load-bearing
  }

  return markProcessed(evt.id);
}

/** Best-effort change-files list. With a GitHub App token we'd fetch the full
 * file list; without, fall back to PR-level totals so the heuristic still has
 * something to chew on. Returns at least one synthetic entry so totalLines is
 * non-zero. */
async function fetchChangedFiles(payload: Json): Promise<ChangedFile[]> {
  const pr = asObject(payload.pull_request);
  const additions = typeof pr?.additions === "number" ? pr.additions : 0;
  const deletions = typeof pr?.deletions === "number" ? pr.deletions : 0;
  return [{ filename: "__pr-aggregate__", additions, deletions }];
}

// ---------------------------------------------------------------------------
// Deploy-incident assessor — emits a skill outcome when a failed deploy
// can be attributed to a recent skill via commit-sha lookup.
// ---------------------------------------------------------------------------

interface DeployIncidentInput {
  organizationId: string;
  projectId: string;
  deploymentId: string;
  environment: string;
  completedAt: Date | null;
  rolledBackAt: Date | null;
  status: "failed" | "rolled_back";
  commitSha: string;
  ownerRepo: string;
  installationId: string | null;
}

async function emitDeployIncidentOutcome(input: DeployIncidentInput): Promise<void> {
  const skillSlug = input.installationId
    ? await attributeSkillFromCommitSha(input.commitSha, input.ownerRepo, input.installationId)
    : null;
  if (!skillSlug) return;
  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.organizationId, input.organizationId), eq(skills.slug, skillSlug)),
  });
  if (!skill) return;

  const result = assessDeployIncident(
    {
      status: input.status,
      environment: input.environment,
      completedAt: input.completedAt,
      rolledBackAt: input.rolledBackAt,
    },
    null,
  );
  if (result.verdict === null) return;
  await recordAssessorOutcome({
    skillId: skill.id,
    projectId: input.projectId,
    sourceKind: "deploy_incident",
    sourceRef: `deployment:${input.deploymentId}`,
    result,
  });
  await recomputeSkillAutonomy(skill.id, input.projectId).catch((err) =>
    console.error("[process-webhook-event] recomputeSkillAutonomy failed:", err),
  );
}

// ---------------------------------------------------------------------------
// Jira — issue events → upsert work_items.
// ---------------------------------------------------------------------------

function jiraExternalKey(payload: Json): string | null {
  const issue = asObject(payload.issue);
  const fields = asObject(issue?.fields);
  const project = asObject(fields?.project);
  const projectKey = asString(project?.key);
  if (!projectKey) return null;
  return jiraExternalKeyFromParts(projectKey, asString(issue?.self) ?? asString(project?.self));
}

function jiraWebhookEventName(evt: WebhookEvent, payload: Json): string {
  if (evt.event && evt.event !== "unknown") return evt.event;
  return asString(payload.webhookEvent) ?? asString(payload.event) ?? "";
}

function isJiraIssueEvent(eventName: string): boolean {
  const value = eventName.toLowerCase();
  return value.startsWith("jira:issue") || value.startsWith("issue_");
}

function asIdString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function dateFromJira(value: unknown, fallback = new Date()): Date {
  const raw = asString(value);
  if (!raw) return fallback;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

async function auditJiraWebhookMutation(input: {
  organizationId: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  actorId?: string | null;
  actorName?: string | null;
}) {
  await db.insert(auditLogs).values({
    organizationId: input.organizationId,
    actorType: "integration",
    actorId: input.actorId ?? "jira",
    actorName: input.actorName ?? "Jira",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    before: input.before ?? null,
    after: input.after ?? null,
    invokedVia: "webhook:jira",
  });
}

const JIRA_PLAN_DESCRIPTION_SECTIONS = new Set([
  "Metadata",
  "Summary",
  "Plan details",
  "Body",
]);

function parseJiraPlanDescription(description: string | null | undefined): {
  summary?: string;
  body?: string;
} {
  const text = description?.replace(/\r\n/g, "\n").trim();
  if (!text) return {};

  const lines = text.split("\n");
  const sections = new Map<string, string[]>();
  let current: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (JIRA_PLAN_DESCRIPTION_SECTIONS.has(trimmed)) {
      current = trimmed;
      sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)?.push(line);
  }

  const sectionText = (name: string) => {
    if (!sections.has(name)) return undefined;
    return (sections.get(name) ?? []).join("\n").trim();
  };

  return {
    summary: sectionText("Summary"),
    body: sectionText("Body"),
  };
}

function jiraCommentDbId(projectTaskId: string, jiraCommentId: string): string {
  return `jira:${projectTaskId}:${jiraCommentId}`;
}

function extractJiraText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(extractJiraText).join("");
  }
  const node = asObject(value);
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (node.type === "hardBreak") return "\n";
  if (!Array.isArray(node.content)) return "";
  const separator = node.type === "doc" ? "\n" : "";
  return node.content.map(extractJiraText).filter(Boolean).join(separator);
}

function jiraCommentCozntCommentId(comment: Json): string | null {
  if (!Array.isArray(comment.properties)) return null;
  for (const item of comment.properties) {
    const property = asObject(item);
    if (asString(property?.key) !== "coznt.commentId") continue;
    const value = asObject(property?.value);
    const commentId = asString(value?.commentId);
    if (commentId) return commentId;
  }
  return null;
}

function workItemAuditShape(row: {
  id?: string;
  source: string;
  externalId: string;
  externalUrl?: string | null;
  projectId?: string | null;
  projectTaskId?: string | null;
  kind?: string | null;
  title: string;
  description?: string | null;
  status?: string | null;
  assigneeEmail?: string | null;
}) {
  return {
    id: row.id,
    source: row.source,
    externalId: row.externalId,
    externalUrl: row.externalUrl ?? null,
    projectId: row.projectId ?? null,
    projectTaskId: row.projectTaskId ?? null,
    kind: row.kind ?? null,
    title: row.title,
    description: row.description ?? null,
    status: row.status ?? null,
    assigneeEmail: row.assigneeEmail ?? null,
  };
}

function planAuditShape(row: {
  id: string;
  kind: string;
  slug: string;
  title: string;
  summary?: string | null;
  body?: string | null;
  status: string;
  externalRef?: string | null;
}) {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? null,
    body: row.body ?? "",
    status: row.status,
    externalRef: row.externalRef ?? null,
  };
}

function jiraStatusDiffersFromPlan(planStatus: string, jiraStatus: string | null | undefined): boolean {
  const expected = canonicalJiraStatus(mapCozntStatusToJira(planStatus));
  const actual = canonicalJiraStatus(jiraStatus);
  return Boolean(expected && actual && expected !== actual);
}

async function auditJiraStatusChangeBlocked(input: {
  organizationId: string;
  planId: string;
  summary: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {
  const recentCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const [recent] = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.organizationId, input.organizationId),
        eq(auditLogs.action, "plan.status_change_blocked_from_jira"),
        eq(auditLogs.entityType, "plan"),
        eq(auditLogs.entityId, input.planId),
        eq(auditLogs.summary, input.summary),
        gte(auditLogs.createdAt, recentCutoff),
      ),
    )
    .limit(1);
  if (recent) return;

  await auditJiraWebhookMutation({
    organizationId: input.organizationId,
    action: "plan.status_change_blocked_from_jira",
    entityType: "plan",
    entityId: input.planId,
    summary: input.summary,
    before: input.before,
    after: input.after,
  });
}

async function blockJiraStatusChangeAndRestore(input: {
  organizationId: string;
  issueKey: string;
  jiraStatus: string;
  plan: Parameters<typeof planAuditShape>[0];
}): Promise<string | null> {
  const targetStatus = mapCozntStatusToJira(input.plan.status);
  const baseSummary = `Jira ${input.issueKey} attempted to change Coznt plan "${input.plan.title}" status from "${input.plan.status}" to "${input.jiraStatus}". Status changes from Jira are not allowed`;

  try {
    const client = await getJiraClient(input.organizationId);
    const transition = await client.transitionIssueByName(input.issueKey, targetStatus);
    const corrected = transition !== null;

    await auditJiraStatusChangeBlocked({
      organizationId: input.organizationId,
      planId: input.plan.id,
      summary: corrected
        ? `${baseSummary}; Coznt restored Jira to "${targetStatus}".`
        : `${baseSummary}; Coznt could not restore Jira to "${targetStatus}".`,
      before: {
        ...planAuditShape(input.plan),
        attemptedJiraStatus: input.jiraStatus,
      },
      after: {
        ...planAuditShape(input.plan),
        blocked: true,
        reason: "status changes from Jira are not allowed",
        jiraIssueKey: input.issueKey,
        attemptedJiraStatus: input.jiraStatus,
        cozntStatus: input.plan.status,
        restoredJiraStatus: corrected ? targetStatus : null,
        corrected,
        transition: transition?.name ?? null,
      },
    });

    return corrected ? targetStatus : null;
  } catch (err) {
    await auditJiraStatusChangeBlocked({
      organizationId: input.organizationId,
      planId: input.plan.id,
      summary: `${baseSummary}; Coznt could not restore Jira to "${targetStatus}".`,
      before: {
        ...planAuditShape(input.plan),
        attemptedJiraStatus: input.jiraStatus,
      },
      after: {
        ...planAuditShape(input.plan),
        blocked: true,
        reason: "status changes from Jira are not allowed",
        jiraIssueKey: input.issueKey,
        attemptedJiraStatus: input.jiraStatus,
        cozntStatus: input.plan.status,
        restoredJiraStatus: null,
        corrected: false,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return null;
  }
}

function commentAuditShape(row: {
  id: string;
  projectTaskId: string;
  authorId: string;
  authorName?: string | null;
  body: string;
  resolved?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: row.id,
    projectTaskId: row.projectTaskId,
    authorId: row.authorId,
    authorName: row.authorName ?? null,
    body: row.body,
    resolved: row.resolved ?? false,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  };
}

async function appendJiraPlanRevision(input: {
  organizationId: string;
  projectTaskId: string;
  body: string;
  metadata?: Record<string, unknown> | null;
  issueKey: string;
}) {
  const last = await db.query.planRevisions.findFirst({
    where: and(
      eq(planRevisions.organizationId, input.organizationId),
      eq(planRevisions.projectTasksId, input.projectTaskId),
    ),
    orderBy: [desc(planRevisions.revisionNumber)],
    columns: { revisionNumber: true },
  });

  await db.insert(planRevisions).values({
    organizationId: input.organizationId,
    projectTasksId: input.projectTaskId,
    revisionNumber: (last?.revisionNumber ?? 0) + 1,
    body: input.body,
    details: input.metadata ?? undefined,
    changeNote: `Synced from Jira ${input.issueKey}`,
    createdById: `jira:${input.issueKey}`,
    createdByName: "Jira",
  });
}

type LinkedJiraWorkItem = { id: string; projectTaskId: string | null };

async function resolveLinkedJiraPlan(input: {
  organizationId: string;
  projectId: string;
  issueKey: string;
  linkedWorkItem?: LinkedJiraWorkItem | null;
}): Promise<{ projectTaskId: string | null; linkedWorkItem: LinkedJiraWorkItem | null }> {
  const linkedWorkItem =
    input.linkedWorkItem === undefined
      ? await db.query.workItems.findFirst({
          where: and(
            eq(workItems.organizationId, input.organizationId),
            eq(workItems.projectId, input.projectId),
            eq(workItems.source, "jira"),
            eq(workItems.externalId, input.issueKey),
          ),
          columns: { id: true, projectTaskId: true },
        })
      : input.linkedWorkItem;

  let projectTaskId = linkedWorkItem?.projectTaskId ?? null;
  if (!projectTaskId) {
    const linkedPlan = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.organizationId, input.organizationId),
        eq(projectTasks.projectId, input.projectId),
        eq(projectTasks.externalRef, `jira:${input.issueKey}`),
      ),
      columns: { id: true },
    });
    projectTaskId = linkedPlan?.id ?? null;
    if (projectTaskId && linkedWorkItem) {
      await db
        .update(workItems)
        .set({ projectTaskId, updatedAt: new Date() })
        .where(eq(workItems.id, linkedWorkItem.id));
    }
  }

  return { projectTaskId, linkedWorkItem: linkedWorkItem ?? null };
}

async function syncLinkedPlanFromJiraIssue(input: {
  organizationId: string;
  projectId: string;
  issueKey: string;
  summary: string;
  description: string | null;
  status: string | null;
  linkedWorkItem?: LinkedJiraWorkItem | null;
}): Promise<{
  linked: boolean;
  mirrorWorkItem: boolean;
  mirrorStatus?: string | null;
  projectTaskId?: string | null;
}> {
  const { projectTaskId, linkedWorkItem } = await resolveLinkedJiraPlan(input);
  if (!projectTaskId) return { linked: false, mirrorWorkItem: true };

  const plan = await db.query.projectTasks.findFirst({
    where: and(
      eq(projectTasks.organizationId, input.organizationId),
      eq(projectTasks.projectId, input.projectId),
      eq(projectTasks.id, projectTaskId),
    ),
  });
  if (!plan) return { linked: false, mirrorWorkItem: true };

  const parsedDescription = parseJiraPlanDescription(input.description);
  const update: Partial<typeof projectTasks.$inferInsert> = {};
  const editableFromJira = plan.status === "draft" || plan.status === "in_review";
  let mirrorStatus = input.status;
  const statusDrifted = jiraStatusDiffersFromPlan(plan.status, input.status);

  if (input.summary && input.summary !== plan.title) update.title = input.summary;
  if (parsedDescription.summary !== undefined && parsedDescription.summary !== (plan.summary ?? "")) {
    update.summary = parsedDescription.summary || null;
  }
  if (parsedDescription.body !== undefined && parsedDescription.body !== (plan.body ?? "")) {
    update.body = parsedDescription.body;
  }

  if (statusDrifted) {
    const correctedStatus = await blockJiraStatusChangeAndRestore({
      organizationId: input.organizationId,
      issueKey: input.issueKey,
      jiraStatus: input.status!,
      plan,
    });
    mirrorStatus = correctedStatus ?? input.status;
  }

  if (Object.keys(update).length === 0) {
    return { linked: true, mirrorWorkItem: statusDrifted, mirrorStatus, projectTaskId };
  }

  if (!editableFromJira) {
    await auditJiraWebhookMutation({
      organizationId: input.organizationId,
      action: "plan.update_blocked_from_jira",
      entityType: "plan",
      entityId: plan.id,
      summary: `Jira ${input.issueKey} attempted to update protected Coznt plan "${plan.title}" while status is ${plan.status}.`,
      before: planAuditShape(plan),
      after: {
        ...planAuditShape(plan),
        blocked: true,
        reason: `plan status ${plan.status} is not editable from Jira`,
        attemptedChanges: update,
      },
    });
    return { linked: true, mirrorWorkItem: false, mirrorStatus, projectTaskId };
  }

  const before = planAuditShape(plan);
  const now = new Date();
  const [updated] = await db
    .update(projectTasks)
    .set({
      ...update,
      updatedAt: now,
      updatedById: `jira:${input.issueKey}`,
      updatedByName: "Jira",
    })
    .where(eq(projectTasks.id, plan.id))
    .returning();

  if (linkedWorkItem) {
    await db
      .update(workItems)
      .set({ lastSyncedAt: now, updatedAt: now })
      .where(eq(workItems.id, linkedWorkItem.id));
  }

  if (update.body !== undefined) {
    await appendJiraPlanRevision({
      organizationId: input.organizationId,
      projectTaskId: plan.id,
      body: update.body,
      metadata: plan.metadata,
      issueKey: input.issueKey,
    });
  }

  await auditJiraWebhookMutation({
    organizationId: input.organizationId,
    action: "plan.updated_from_jira",
    entityType: "plan",
    entityId: plan.id,
    summary: `Jira ${input.issueKey} updated Coznt plan "${plan.title}".`,
    before,
    after: planAuditShape(updated),
  });
  return { linked: true, mirrorWorkItem: true, mirrorStatus, projectTaskId };
}

async function auditJiraWorkItemSync(input: {
  organizationId: string;
  workItemId: string;
  issueKey: string;
  before: ReturnType<typeof workItemAuditShape> | null;
  after: ReturnType<typeof workItemAuditShape>;
}) {
  if (input.before && jsonEqual(input.before, input.after)) return;
  await auditJiraWebhookMutation({
    organizationId: input.organizationId,
    action: input.before ? "work_item.updated_from_jira" : "work_item.synced_from_jira",
    entityType: "work_item",
    entityId: input.workItemId,
    summary: input.before
      ? `Jira ${input.issueKey} updated task mirror "${input.after.title}".`
      : `Jira ${input.issueKey} synced task mirror "${input.after.title}".`,
    before: input.before,
    after: input.after,
  });
}

async function mirrorJiraCommentToPlan(input: {
  organizationId: string;
  projectId: string;
  issueKey: string;
  eventName: string;
  comment: Json;
}): Promise<boolean> {
  const commentId = asIdString(input.comment.id);
  if (!commentId) return false;

  const { projectTaskId } = await resolveLinkedJiraPlan(input);
  if (!projectTaskId) return false;

  const mirrorId = jiraCommentDbId(projectTaskId, commentId);
  const cozntOriginCommentId = jiraCommentCozntCommentId(input.comment);
  const isDelete = input.eventName.includes("comment_deleted");
  const existingComment = await db.query.comments.findFirst({
    where: and(
      eq(comments.organizationId, input.organizationId),
      eq(comments.projectTaskId, projectTaskId),
      eq(comments.id, mirrorId),
    ),
  });

  if (isDelete || cozntOriginCommentId) {
    if (existingComment) {
      await db
        .delete(comments)
        .where(
          and(
            eq(comments.organizationId, input.organizationId),
            eq(comments.projectTaskId, projectTaskId),
            eq(comments.id, mirrorId),
          ),
        );
      await auditJiraWebhookMutation({
        organizationId: input.organizationId,
        action: "comment.deleted_from_jira",
        entityType: "comment",
        entityId: mirrorId,
        summary: `Jira ${input.issueKey} deleted a mirrored plan comment.`,
        before: commentAuditShape(existingComment),
        after: null,
      });
      return true;
    }
    return false;
  }

  const createdAt = dateFromJira(input.comment.created);
  const updatedAt = dateFromJira(input.comment.updated, createdAt);
  const author = asObject(input.comment.author) ?? asObject(input.comment.updateAuthor);
  const authorName = asString(author?.displayName) ?? "Jira user";
  const authorAccountId = asString(author?.accountId);
  const body = extractJiraText(input.comment.body).trim() || "No comment body.";
  const nextComment = {
    id: mirrorId,
    projectTaskId,
    authorId: `jira:${commentId}`,
    authorName,
    body,
    resolved: false,
    createdAt,
    updatedAt,
  };

  await db
    .insert(comments)
    .values({
      organizationId: input.organizationId,
      id: nextComment.id,
      projectTaskId: nextComment.projectTaskId,
      parentCommentId: null,
      authorId: nextComment.authorId,
      authorName: nextComment.authorName,
      body: nextComment.body,
      resolved: nextComment.resolved,
      createdAt: nextComment.createdAt,
      updatedAt: nextComment.updatedAt,
    })
    .onConflictDoUpdate({
      target: comments.id,
      set: {
        authorName: sql`excluded.author_name`,
        body: sql`excluded.body`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  const before = existingComment ? commentAuditShape(existingComment) : null;
  const after = commentAuditShape(nextComment);
  const changed = !before || !jsonEqual(before, after);
  if (changed) {
    await auditJiraWebhookMutation({
      organizationId: input.organizationId,
      action: before ? "comment.updated_from_jira" : "comment.created_from_jira",
      entityType: "comment",
      entityId: mirrorId,
      summary: before
        ? `Jira ${input.issueKey} updated a mirrored plan comment.`
        : `Jira ${input.issueKey} added a mirrored plan comment.`,
      before,
      after,
      actorId: authorAccountId ? `jira:${authorAccountId}` : undefined,
      actorName: authorName,
    });
  }
  return changed;
}

async function handleJira(evt: WebhookEvent): Promise<void> {
  if (!evt.organizationId) {
    return markProcessed(evt.id, "webhook has no organizationId");
  }
  const payload = asObject(evt.payload) ?? {};
  const externalKey = jiraExternalKey(payload);
  if (!externalKey) {
    return markProcessed(evt.id, "jira payload missing project.key");
  }
  const projectId = await resolveProjectForWebhook(evt.organizationId, "jira", externalKey);
  if (!projectId) {
    return markProcessed(evt.id, `no project binding for jira:${externalKey}`);
  }

  const eventName = jiraWebhookEventName(evt, payload);
  const issue = asObject(payload.issue);
  const issueKey = asString(issue?.key);
  const comment = asObject(payload.comment);
  let mirroredJiraComment = false;

  if (comment) {
    if (!issue || !issueKey) {
      return markProcessed(evt.id, "jira comment payload missing issue.key");
    }
    mirroredJiraComment = await mirrorJiraCommentToPlan({
      organizationId: evt.organizationId,
      projectId,
      issueKey,
      eventName,
      comment,
    });
  }

  if (!isJiraIssueEvent(eventName) && !comment) {
    return markProcessed(evt.id);
  }

  if (!issue || !issueKey) {
    return markProcessed(evt.id, "jira payload missing issue.key");
  }

  const fields = asObject(issue.fields) ?? {};
  const summary = asString(fields.summary) ?? issueKey;
  const description = extractJiraText(fields.description).trim() || null;
  const statusObj = asObject(fields.status);
  const status = asString(statusObj?.name) ?? null;
  const typeObj = asObject(fields.issuetype);
  const typeName = (asString(typeObj?.name) ?? "task").toLowerCase();
  const assignee = asObject(fields.assignee);
  const assigneeEmail = asString(assignee?.emailAddress);

  const kind = typeName.includes("epic")
    ? "epic"
    : typeName.includes("bug")
      ? "bug"
      : typeName.includes("story")
        ? "story"
        : "task";

  const externalUrl = jiraBrowseUrlFromIssueSelf(asString(issue.self), issueKey) ?? undefined;

  const existingWorkItem = await db.query.workItems.findFirst({
    where: and(
      eq(workItems.organizationId, evt.organizationId),
      eq(workItems.projectId, projectId),
      eq(workItems.source, "jira"),
      eq(workItems.externalId, issueKey),
    ),
  });
  const beforeWorkItem = existingWorkItem ? workItemAuditShape(existingWorkItem) : null;

  const planSync = await syncLinkedPlanFromJiraIssue({
    organizationId: evt.organizationId,
    projectId,
    issueKey,
    summary,
    description,
    status,
    linkedWorkItem: existingWorkItem
      ? { id: existingWorkItem.id, projectTaskId: existingWorkItem.projectTaskId }
      : null,
  });
  if (planSync.linked && !planSync.mirrorWorkItem && !mirroredJiraComment) {
    return markProcessed(evt.id);
  }

  const workItemId = await upsertWorkItem({
    organizationId: evt.organizationId,
    projectId,
    source: "jira",
    externalId: issueKey,
    externalUrl,
    kind,
    title: summary,
    description: description ?? undefined,
    status: planSync.mirrorStatus ?? status ?? undefined,
    assigneeEmail,
    projectTaskId: planSync.projectTaskId ?? undefined,
    raw: payload,
  });

  const syncedWorkItem = await db.query.workItems.findFirst({
    where: and(eq(workItems.organizationId, evt.organizationId), eq(workItems.id, workItemId)),
  });
  if (syncedWorkItem && !planSync.linked) {
    await auditJiraWorkItemSync({
      organizationId: evt.organizationId,
      workItemId,
      issueKey,
      before: beforeWorkItem,
      after: workItemAuditShape(syncedWorkItem),
    });
  }

  return markProcessed(evt.id);
}

// ---------------------------------------------------------------------------
// Azure DevOps — build/release completion → recordDeployment.
// ---------------------------------------------------------------------------

function adoExternalKey(payload: Json): string | null {
  const containers = asObject(payload.resourceContainers);
  const project = asObject(containers?.project);
  const account = asObject(containers?.account);
  const projectName = asString(project?.baseUrl) ?? asString(project?.id);
  const accountName = asString(account?.baseUrl) ?? asString(account?.id);
  return projectName && accountName ? `${accountName}/${projectName}` : null;
}

async function handleADO(evt: WebhookEvent): Promise<void> {
  if (!evt.organizationId) {
    return markProcessed(evt.id, "webhook has no organizationId");
  }
  const payload = asObject(evt.payload) ?? {};
  const externalKey = adoExternalKey(payload);
  if (!externalKey) {
    return markProcessed(evt.id, "ado payload missing resourceContainers");
  }
  const projectId = await resolveProjectForWebhook(evt.organizationId, "ado", externalKey);
  if (!projectId) {
    return markProcessed(evt.id, `no project binding for ado:${externalKey}`);
  }

  const eventName = evt.event ?? "";
  const resource = asObject(payload.resource) ?? {};

  if (eventName === "build.complete") {
    const status = asString(resource.status);
    const result = asString(resource.result);
    if (status !== "completed") return markProcessed(evt.id);
    if (result !== "succeeded" && result !== "failed") {
      return markProcessed(evt.id);
    }
    const buildNumber = asString(resource.buildNumber) ?? "unknown";
    const sourceVersion = asString(resource.sourceVersion);
    const sourceBranch = asString(resource.sourceBranch);
    const ciRunUrl = asString(asObject(resource._links)?.web as unknown as string) ??
      asString((asObject(resource._links)?.web as unknown as { href?: string } | null)?.href);
    try {
      await recordDeployment({
        projectId,
        environment: sourceBranch?.includes("release") ? "production" : "build",
        version: buildNumber,
        commitSha: sourceVersion,
        status: result === "succeeded" ? "success" : "failed",
        ciRunUrl: ciRunUrl ?? undefined,
        raw: payload,
        completedAt: new Date(),
      });
      return markProcessed(evt.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return markProcessed(evt.id, `recordDeployment failed: ${msg}`);
    }
  }

  if (eventName === "ms.vss-release.deployment-completed") {
    const status = asString(resource.status);
    if (status !== "succeeded" && status !== "failed") return markProcessed(evt.id);
    const release = asObject(resource.release) ?? {};
    const environment = asObject(resource.environment) ?? {};
    const envName = asString(environment.name) ?? "production";
    const version = asString(release.name) ?? "unknown";
    try {
      await recordDeployment({
        projectId,
        environment: envName,
        version,
        status: status === "succeeded" ? "success" : "failed",
        raw: payload,
        completedAt: new Date(),
      });
      return markProcessed(evt.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return markProcessed(evt.id, `recordDeployment failed: ${msg}`);
    }
  }

  if (eventName.startsWith("workitem.")) {
    const id = asString(resource.id) ?? (resource.id != null ? String(resource.id) : null);
    if (!id) return markProcessed(evt.id, "ado workitem payload missing id");
    const fields = asObject(resource.fields) ?? {};
    const title =
      asString(fields["System.Title"]) ?? asString(resource.title) ?? `work item ${id}`;
    const description = asString(fields["System.Description"]) ?? null;
    const state = asString(fields["System.State"]) ?? null;
    const workItemType = (asString(fields["System.WorkItemType"]) ?? "task").toLowerCase();
    const assignedTo = asObject(fields["System.AssignedTo"]);
    const assigneeEmail = asString(assignedTo?.uniqueName);
    const externalUrl = asString(asObject(resource._links)?.html as unknown) ??
      asString((asObject(resource._links)?.html as unknown as { href?: string } | null)?.href);

    const kind = workItemType.includes("epic")
      ? "epic"
      : workItemType.includes("bug")
        ? "bug"
        : workItemType.includes("story") || workItemType.includes("feature")
          ? "story"
          : "task";

    await upsertWorkItem({
      organizationId: evt.organizationId,
      projectId,
      source: "ado",
      externalId: id,
      externalUrl,
      kind,
      title,
      description: description ?? undefined,
      status: state ?? undefined,
      assigneeEmail,
      raw: payload,
    });
    return markProcessed(evt.id);
  }

  return markProcessed(evt.id);
}

// ---------------------------------------------------------------------------
// Confluence — page events → upsert work_items (kind="page").
// ---------------------------------------------------------------------------

function confluenceExternalKey(payload: Json): string | null {
  const page = asObject(payload.page);
  const space = asObject(payload.space);
  return asString(page?.spaceKey) ?? asString(space?.key) ?? null;
}

async function handleConfluence(evt: WebhookEvent): Promise<void> {
  if (!evt.organizationId) {
    return markProcessed(evt.id, "webhook has no organizationId");
  }
  const payload = asObject(evt.payload) ?? {};
  const externalKey = confluenceExternalKey(payload);
  if (!externalKey) {
    return markProcessed(evt.id, "confluence payload missing space key");
  }
  const projectId = await resolveProjectForWebhook(
    evt.organizationId,
    "confluence",
    externalKey,
  );
  if (!projectId) {
    return markProcessed(evt.id, `no project binding for confluence:${externalKey}`);
  }

  const eventName = evt.event ?? "";
  if (!eventName.startsWith("page_")) {
    return markProcessed(evt.id);
  }

  const page = asObject(payload.page);
  const pageId = asString(page?.id) ?? (page?.id != null ? String(page.id) : null);
  if (!pageId) return markProcessed(evt.id, "confluence payload missing page.id");

  const title = asString(page?.title) ?? `page ${pageId}`;
  const version = asObject(page?.version);
  const versionNumber = typeof version?.number === "number" ? version.number : null;
  const status = eventName === "page_removed" ? "Removed" : `Published v${versionNumber ?? 1}`;
  const baseUrl = asString(page?.self);
  const externalUrl = baseUrl ?? undefined;

  await upsertWorkItem({
    organizationId: evt.organizationId,
    projectId,
    source: "confluence",
    externalId: pageId,
    externalUrl,
    kind: "page",
    title,
    status,
    raw: payload,
  });

  return markProcessed(evt.id);
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

import type { TaskParams } from "@/automations/task-router";

/**
 * Worker-facing entrypoint. The rules engine passes a `TaskParams` carrying
 * the webhook_events row id. We fetch the row and dispatch to per-source
 * handlers.
 */
export async function processWebhookEvent(params: TaskParams): Promise<void> {
  const [evt] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.id, params.entityId))
    .limit(1);
  if (!evt || evt.processedAt) return;
  await dispatchWebhookEvent(evt);
}

export async function dispatchWebhookEvent(evt: WebhookEvent): Promise<void> {
  try {
    switch (evt.source) {
      case "github":
        return await handleGitHub(evt);
      case "jira":
        return await handleJira(evt);
      case "ado":
        return await handleADO(evt);
      case "confluence":
        return await handleConfluence(evt);
      default:
        return await markProcessed(evt.id, `unknown source: ${evt.source}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markProcessed(evt.id, msg);
  }
}
