/**
 * Outbound integration push — coznt → external SDLC systems.
 *
 * Every function here is best-effort:
 *   1. No adapter binding for the project + provider → no-op (returns null).
 *   2. Push failure is logged but never re-thrown — sync upstream must not
 *      block the primary coznt operation (approval, gate pass, etc.).
 *   3. Success writes `externalRef` back on the source row and (where it
 *      makes sense) upserts a `work_items` row so the link is queryable.
 *
 * This is the partner of `src/automations/tasks/process-webhook-event.ts` —
 * outbound here, inbound there.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { planArtifacts as plans } from "@/db/schema/plan/plan-artifact";
import { workItems } from "@/db/schema/work-item";
import { getOutboundBinding } from "@/operations/choreography/adapter-bindings";
import { upsertWorkItem } from "@/operations/work/work-items";
import { createLogger } from "@/lib/logger";
import {
  getJiraClient,
  getAdoClient,
  getConfluenceClient,
  getGitHubClient,
} from "@/lib/integrations/clients";

const log = createLogger("integrations:outbound");

// ---------------------------------------------------------------------------
// Plan kind → external issue type mapping
// ---------------------------------------------------------------------------

const PLAN_KIND_TO_JIRA_TYPE: Record<string, string> = {
  epic: "Epic",
  feature: "Story",
  story: "Story",
  test_plan: "Task",
  release_plan: "Task",
  adr: "Task",
};

const PLAN_KIND_TO_ADO_TYPE: Record<string, string> = {
  epic: "Epic",
  feature: "Feature",
  story: "User Story",
  test_plan: "Task",
  release_plan: "Task",
  adr: "Task",
};

// ---------------------------------------------------------------------------
// Jira
// ---------------------------------------------------------------------------

/**
 * Create (or update) a Jira issue for a plan. Skips silently if the project
 * has no Jira binding. On first push, stores the issue key on
 * `plans.externalRef` and upserts a `work_items` row.
 *
 * Re-running on an already-pushed plan updates summary + description in place.
 */
export async function pushPlanToJira(
  planId: string,
  options: { throwOnError?: boolean } = {},
): Promise<{ key: string; url: string } | null> {
  try {
    const plan = await db.query.planArtifacts.findFirst({ where: eq(plans.id, planId) });
    if (!plan) throw new Error("Plan not found");

    const binding = await getOutboundBinding(plan.organizationId, plan.projectId, "jira");
    if (!binding) throw new Error("No Jira binding configured for this project");

    const issueType = PLAN_KIND_TO_JIRA_TYPE[plan.kind] ?? "Task";
    const client = await getJiraClient(plan.organizationId);
    const description = plan.summary ?? plan.body?.slice(0, 1000) ?? "";

    // Already pushed → update.
    if (plan.externalRef && plan.externalRef.startsWith("jira:")) {
      const issueKey = plan.externalRef.slice("jira:".length);
      await client.updateIssue(issueKey, {
        summary: plan.title,
        description,
      });
      const url = client.issueBrowseUrl(issueKey);
      await upsertWorkItem({
        organizationId: plan.organizationId,
        projectId: plan.projectId,
        planArtifactId: plan.id,
        source: "jira",
        externalId: issueKey,
        externalUrl: url,
        kind: jiraIssueTypeToWorkItemKind(issueType),
        title: plan.title,
        description,
      });
      return { key: issueKey, url };
    }

    // First push → create.
    const created = await client.createIssue(binding.externalKey, {
      summary: plan.title,
      description,
      issueType,
      labels: [`coznt-${plan.kind}`],
    });
    const url = client.issueBrowseUrl(created.key);

    await db
      .update(plans)
      .set({ externalRef: `jira:${created.key}`, updatedAt: new Date() })
      .where(eq(plans.id, plan.id));

    await upsertWorkItem({
      organizationId: plan.organizationId,
      projectId: plan.projectId,
      planArtifactId: plan.id,
      source: "jira",
      externalId: created.key,
      externalUrl: url,
      kind: jiraIssueTypeToWorkItemKind(issueType),
      title: plan.title,
      description,
      status: "Open",
    });

    log.info(`pushed plan ${plan.id} to Jira ${created.key}`);
    return { key: created.key, url };
  } catch (err) {
    log.error("pushPlanToJira failed", { planId, err: String(err) });
    if (options.throwOnError) throw err;
    return null;
  }
}

function jiraIssueTypeToWorkItemKind(issueType: string): "epic" | "story" | "task" {
  const normalized = issueType.toLowerCase();
  if (normalized === "epic") return "epic";
  if (normalized === "story") return "story";
  return "task";
}

/**
 * Transition a Jira issue to a target status by name. Caller passes the coznt
 * status; this function maps to a sensible Jira name and asks Jira to find
 * the matching transition.
 */
export async function transitionJiraIssueForPlan(
  planId: string,
  targetStatus: string,
): Promise<{ name: string } | null> {
  try {
    const plan = await db.query.planArtifacts.findFirst({ where: eq(plans.id, planId) });
    if (!plan || !plan.externalRef?.startsWith("jira:")) return null;

    const binding = await getOutboundBinding(plan.organizationId, plan.projectId, "jira");
    if (!binding) return null;

    const client = await getJiraClient(plan.organizationId);
    const issueKey = plan.externalRef.slice("jira:".length);
    const target = mapCozntStatusToJira(targetStatus);
    const result = await client.transitionIssueByName(issueKey, target);
    if (!result) {
      log.warn(`no Jira transition matched "${target}" for ${issueKey}`);
      return null;
    }
    log.info(`transitioned Jira ${issueKey} via "${result.name}"`);
    return { name: result.name };
  } catch (err) {
    log.error("transitionJiraIssueForPlan failed", { planId, err: String(err) });
    return null;
  }
}

/**
 * Status-name mapping. Jira workflows vary across projects; we map to the
 * canonical default-workflow names and rely on `transitionIssueByName`'s
 * case-insensitive match to handle minor variations.
 */
function mapCozntStatusToJira(status: string): string {
  const s = status.toLowerCase();
  if (s === "draft" || s === "in_review" || s === "changes_requested") return "To Do";
  if (s === "approved" || s === "in_progress") return "In Progress";
  if (s === "completed" || s === "done") return "Done";
  if (s === "rejected" || s === "cancelled") return "Won't Do";
  return status;
}

/**
 * Push status for a work_item that was sourced from Jira. Called from the
 * MCP PATCH route after the coznt-side update.
 */
export async function syncWorkItemStatusToJira(
  organizationId: string,
  workItemId: string,
): Promise<{ name: string } | null> {
  try {
    const wi = await db.query.workItems.findFirst({
      where: and(eq(workItems.id, workItemId), eq(workItems.organizationId, organizationId)),
    });
    if (!wi || wi.source !== "jira" || !wi.status) return null;

    const client = await getJiraClient(organizationId);
    const target = mapCozntStatusToJira(wi.status);
    const result = await client.transitionIssueByName(wi.externalId, target);
    if (!result) {
      log.warn(`no Jira transition matched "${target}" for ${wi.externalId}`);
      return null;
    }
    log.info(`synced work item ${wi.id} → Jira ${wi.externalId} via "${result.name}"`);
    return { name: result.name };
  } catch (err) {
    log.error("syncWorkItemStatusToJira failed", { workItemId, err: String(err) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Confluence — push ADR body as a page on approval
// ---------------------------------------------------------------------------

/**
 * Push an approved ADR (or any markdown-bodied plan) to Confluence. Creates
 * the page on first call, updates in place on subsequent calls.
 */
export async function pushPlanToConfluence(planId: string): Promise<{ pageId: string; url: string } | null> {
  try {
    const plan = await db.query.planArtifacts.findFirst({ where: eq(plans.id, planId) });
    if (!plan) return null;

    const binding = await getOutboundBinding(plan.organizationId, plan.projectId, "confluence");
    if (!binding) return null;

    const client = await getConfluenceClient(plan.organizationId);
    const title = plan.title;
    const body = markdownToConfluenceStorage(plan.body ?? "");

    // Already pushed → update.
    if (plan.externalRef?.startsWith("confluence:")) {
      const pageId = plan.externalRef.slice("confluence:".length);
      const current = await client.getPage(pageId);
      const updated = await client.updatePage(pageId, title, body, current.version);
      return { pageId: updated.id, url: updated.url };
    }

    // First push → create.
    const created = await client.createPage(binding.externalKey, title, body);

    await db
      .update(plans)
      .set({ externalRef: `confluence:${created.id}`, updatedAt: new Date() })
      .where(eq(plans.id, plan.id));

    await upsertWorkItem({
      organizationId: plan.organizationId,
      projectId: plan.projectId,
      planArtifactId: plan.id,
      source: "confluence",
      externalId: created.id,
      externalUrl: created.url,
      kind: "page",
      title,
      description: plan.summary ?? undefined,
      status: "Published",
    });

    log.info(`pushed plan ${plan.id} to Confluence page ${created.id}`);
    return { pageId: created.id, url: created.url };
  } catch (err) {
    log.error("pushPlanToConfluence failed", { planId, err: String(err) });
    return null;
  }
}

/**
 * Minimal Markdown → Confluence storage XHTML conversion. Confluence accepts
 * a constrained XHTML in its storage format; for v1 we wrap the markdown in
 * a `<ac:structured-macro ac:name="markdown">` macro so it renders verbatim.
 * Customers without the Markdown Macro can replace with a richer converter.
 */
function markdownToConfluenceStorage(md: string): string {
  const escaped = md.replace(/]]>/g, "]]]]><![CDATA[>");
  return `<ac:structured-macro ac:name="markdown" ac:schema-version="1"><ac:plain-text-body><![CDATA[${escaped}]]></ac:plain-text-body></ac:structured-macro>`;
}

// ---------------------------------------------------------------------------
// Azure DevOps — generic pipeline trigger + work item push
// ---------------------------------------------------------------------------

// NOTE: `triggerAdoPipelineForGate` was removed in the governance refactor.
// It read `phase_gates` (now collapsed into `governance_records` with
// kind=gate) and dispatched a pipeline run when a CI/CD-phase gate passed.
// CI/CD orchestration on gate decision now belongs in the evaluator
// dispatcher (`src/operations/governance/evaluator.ts`) when needed.
// Callers should use `triggerPipelineForProject` directly.

/**
 * Generic pipeline trigger by source — backs the `trigger_pipeline` MCP verb.
 *
 * Resolves the project's outbound binding for the requested source and
 * dispatches a run. Returns the run id (and html url when available).
 *
 * Throws with `{ kind: "missing_binding" }` when the project has no
 * integration credentials for the requested source.
 */
export async function triggerPipelineForProject(args: {
  organizationId: string;
  projectId: string;
  source: "GITHUB" | "AZURE_DEVOPS";
  workflowId: string;
  branch?: string;
}): Promise<{ runId: string | null; htmlUrl: string | null; status: string }> {
  const adapterKind = args.source === "GITHUB" ? "github" : "ado";
  const binding = await getOutboundBinding(args.organizationId, args.projectId, adapterKind);
  if (!binding) {
    const err = new Error(`No ${args.source} integration bound to this project`) as Error & {
      kind?: string;
      status?: number;
    };
    err.kind = "missing_binding";
    err.status = 412;
    throw err;
  }

  if (args.source === "GITHUB") {
    const [owner, repo] = binding.externalKey.split("/");
    if (!owner || !repo) {
      throw new Error(`Malformed GitHub binding externalKey: ${binding.externalKey}`);
    }
    const client = await getGitHubClient(args.organizationId);
    const result = await client.dispatchWorkflow({
      owner,
      repo,
      workflowId: args.workflowId,
      ref: args.branch ?? "main",
    });
    return { runId: null, htmlUrl: null, status: result.status };
  }

  // Azure DevOps
  const config = (binding.config as { project?: string } | null) ?? {};
  const [account, projectName] = binding.externalKey.split("/");
  const adoProject = config.project ?? projectName ?? account;
  const client = await getAdoClient(args.organizationId);
  const pipelineId = Number(args.workflowId);
  if (!Number.isFinite(pipelineId)) {
    throw new Error(`ADO workflowId must be numeric, got "${args.workflowId}"`);
  }
  const result = (await client.triggerPipeline(adoProject, pipelineId, args.branch)) as
    | { id?: number; _links?: { web?: { href?: string } } }
    | undefined;
  return {
    runId: result?.id ? String(result.id) : null,
    htmlUrl: result?._links?.web?.href ?? null,
    status: "queued",
  };
}

/**
 * Create an ADO work item for a plan. Mirror of `pushPlanToJira` for orgs
 * that run on ADO Boards instead of Jira.
 */
export async function pushPlanToAdo(planId: string): Promise<{ id: number; url: string } | null> {
  try {
    const plan = await db.query.planArtifacts.findFirst({ where: eq(plans.id, planId) });
    if (!plan) return null;

    const binding = await getOutboundBinding(plan.organizationId, plan.projectId, "ado");
    if (!binding) return null;

    // Don't re-create. ADO has no in-place title/description update method
    // here yet; that's a follow-up. v1: create once, update via webhook sync.
    if (plan.externalRef?.startsWith("ado:")) return null;

    const [account, projectName] = binding.externalKey.split("/");
    const config = (binding.config as { project?: string } | null) ?? {};
    const adoProject = config.project ?? projectName ?? account;

    const workItemType = PLAN_KIND_TO_ADO_TYPE[plan.kind] ?? "Task";
    const client = await getAdoClient(plan.organizationId);
    const created = await client.createWorkItem(adoProject, {
      workItemType,
      title: plan.title,
      description: plan.summary ?? plan.body?.slice(0, 1000) ?? "",
      tags: [`coznt-${plan.kind}`],
    });

    await db
      .update(plans)
      .set({ externalRef: `ado:${created.id}`, updatedAt: new Date() })
      .where(eq(plans.id, plan.id));

    await upsertWorkItem({
      organizationId: plan.organizationId,
      projectId: plan.projectId,
      planArtifactId: plan.id,
      source: "ado",
      externalId: String(created.id),
      externalUrl: created.url,
      kind: workItemType.toLowerCase().includes("epic")
        ? "epic"
        : workItemType.toLowerCase().includes("bug")
          ? "bug"
          : "story",
      title: plan.title,
      description: plan.summary ?? undefined,
      status: created.state,
    });

    log.info(`pushed plan ${plan.id} to ADO work item ${created.id}`);
    return { id: created.id, url: created.url };
  } catch (err) {
    log.error("pushPlanToAdo failed", { planId, err: String(err) });
    return null;
  }
}
