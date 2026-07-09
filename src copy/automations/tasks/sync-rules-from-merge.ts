/**
 * Sync `.agents/rules/*.md` files into the `rules` table on default-branch
 * push. Per docs/spec/dev-authoring-surface.md §12:
 *
 *   Added rule, severity ≤ warn         → direct DB write + audit
 *   Added rule, severity = error        → governance_records.review
 *   Modified body / description only    → direct DB write + audit
 *   Modified validator/config/appliesTo → governance_records.review
 *   Modified severity up                → governance_records.review
 *   Removed rule                        → governance_records.approval
 *
 * Behavior changes always route through review. Documentation-only updates
 * (description, body explaining the rule's history) auto-apply.
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { db } from "@/db/client";
import { rules, type Rule, type RuleSeverity } from "@/db/schema/rule";
import { ruleFileFrontmatterSchema, type RuleFileFrontmatter } from "@/lib/authoring/schemas";
import {
  discoverFiles,
  loadAuthoringPaths,
  orderForApply,
  writeMergeAudit,
  type MergeSyncContext,
} from "./sync-shared";

export interface RuleSyncDiff {
  op: "added" | "modified" | "removed";
  slug: string;
  path: string | null;
  fm: RuleFileFrontmatter | null;
  existing: Rule | null;
  routedTo: "direct" | "review" | "approval";
  reason: string;
}

export interface RuleSyncResult {
  applied: RuleSyncDiff[];
  parseErrors: Array<{ path: string; message: string }>;
}

const SEVERITY_ORDER: Record<RuleSeverity, number> = { info: 0, warn: 1, error: 2 };

export async function syncRulesFromMerge(ctx: MergeSyncContext): Promise<RuleSyncResult> {
  const paths = await loadAuthoringPaths(ctx);
  const { files, errors } = await discoverFiles(ctx, [paths.rules]);

  const incoming = new Map<
    string,
    { path: string; fm: RuleFileFrontmatter; body: string }
  >();
  for (const f of files) {
    const result = ruleFileFrontmatterSchema.safeParse(f.parsed.data);
    if (!result.success) {
      errors.push({
        path: f.path,
        message: `invalid rule frontmatter: ${result.error.message}`,
      });
      continue;
    }
    const slug = result.data.slug;
    if (incoming.has(slug)) {
      errors.push({
        path: f.path,
        message: `duplicate rule slug "${slug}" (also in ${incoming.get(slug)!.path})`,
      });
      continue;
    }
    incoming.set(slug, { path: f.path, fm: result.data, body: f.parsed.body.trim() });
  }

  const existing = await db.query.rules.findMany({
    where: and(
      eq(rules.organizationId, ctx.organizationId),
      eq(rules.projectId, ctx.projectId),
      isNotNull(rules.claimedPath),
    ),
  });
  const existingBySlug = new Map(existing.map((r) => [r.slug, r]));

  const diffs: RuleSyncDiff[] = [];

  // Removed
  for (const [slug, row] of existingBySlug) {
    if (incoming.has(slug)) continue;
    diffs.push({
      op: "removed",
      slug,
      path: row.claimedPath,
      fm: null,
      existing: row,
      routedTo: "approval",
      reason: "removal requires approval per §12",
    });
  }

  // Added / modified
  for (const [slug, { path, fm, body }] of incoming) {
    const existingRow = existingBySlug.get(slug) ?? null;
    const incomingSeverity: RuleSeverity = fm.severity ?? "warn";

    if (!existingRow) {
      const wouldReview = incomingSeverity === "error";
      const preApproved = wouldReview && ctx.preApprovedSlugs?.has(slug);
      const route: "direct" | "review" = !wouldReview || preApproved ? "direct" : "review";
      diffs.push({
        op: "added",
        slug,
        path,
        fm,
        existing: null,
        routedTo: route,
        reason: preApproved
          ? `pre-approved via coznt:approve PR comment`
          : route === "direct"
            ? `severity ${incomingSeverity} (advisory) — auto-apply`
            : `new blocking rule (severity=error) requires review`,
      });
      continue;
    }

    const existingFm = parseExistingRuleFrontmatter(existingRow.body);
    const bodyChanged = (existingRow.body ?? "").trim() !== rebuildRuleBody(fm, body).trim();
    const oldSeverity = existingRow.severity;
    const severityRose = SEVERITY_ORDER[incomingSeverity] > SEVERITY_ORDER[oldSeverity];

    const configChanged = !configEqual(existingFm?.config, (fm as { config?: unknown }).config);
    const appliesToChanged = !configEqual(existingFm?.appliesTo, (fm as { appliesTo?: unknown }).appliesTo);
    const validatorChanged = existingFm?.validator !== fm.validator;

    const isBehaviorChange = configChanged || appliesToChanged || validatorChanged || severityRose;

    if (!bodyChanged && !isBehaviorChange && existingRow.title === fm.name) {
      continue;
    }

    const preApproved = isBehaviorChange && ctx.preApprovedSlugs?.has(slug);
    const route: "direct" | "review" =
      !isBehaviorChange || preApproved ? "direct" : "review";
    diffs.push({
      op: "modified",
      slug,
      path,
      fm,
      existing: existingRow,
      routedTo: route,
      reason: preApproved
        ? "pre-approved via coznt:approve PR comment"
        : route === "direct"
          ? "body / description only — auto-apply"
          : severityRose
            ? `severity ${oldSeverity} → ${incomingSeverity} requires review`
            : "validator/config/appliesTo change requires review",
    });
  }

  if (ctx.preview) {
    return { applied: diffs, parseErrors: errors };
  }

  for (const diff of orderForApply(diffs)) {
    try {
      await applyOne(ctx, diff);
    } catch (err) {
      errors.push({
        path: diff.path ?? `<${diff.slug}>`,
        message: `apply failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return { applied: diffs, parseErrors: errors };
}

/** Build the canonical rule body: YAML frontmatter (config/appliesTo/validator) + markdown. */
function rebuildRuleBody(fm: RuleFileFrontmatter, prose: string): string {
  const fmObj: Record<string, unknown> = {
    validator: fm.validator,
    appliesTo: (fm as { appliesTo?: unknown }).appliesTo,
    config: (fm as { config?: unknown }).config,
  };
  const yaml = yamlStringify(fmObj, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${prose}`;
}

interface ParsedExisting {
  validator?: string;
  appliesTo?: unknown;
  config?: unknown;
}

function parseExistingRuleFrontmatter(body: string): ParsedExisting | null {
  const match = body.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    const parsed = yamlParse(match[1]);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ParsedExisting;
  } catch {
    return null;
  }
}

function configEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

async function applyOne(ctx: MergeSyncContext, diff: RuleSyncDiff): Promise<void> {
  const invokedVia = ctx.prNumber
    ? `merge-webhook:pr#${ctx.prNumber}`
    : "merge-webhook:push";

  if (diff.routedTo !== "direct") {
    await writeMergeAudit({
      organizationId: ctx.organizationId,
      action: `rule.${diff.op}.${diff.routedTo}-pending`,
      entityType: "rule",
      entityId: diff.existing?.id ?? diff.slug,
      summary: `${diff.op}: ${diff.slug} routed to ${diff.routedTo}: ${diff.reason}`,
      after: diff.fm
        ? { fm: diff.fm, route: diff.routedTo, claimedPath: diff.path }
        : { route: diff.routedTo },
      invokedVia,
    });
    return;
  }

  if (diff.op === "added" && diff.fm && diff.path) {
    const fm = diff.fm;
    const file = await readRuleBody(ctx, diff.path);
    await db.insert(rules).values({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      slug: fm.slug,
      title: fm.name,
      body: file ?? rebuildRuleBody(fm, ""),
      severity: fm.severity ?? "warn",
      enabled: fm.enabled ?? true,
      claimedPath: diff.path,
    });
    await writeMergeAudit({
      organizationId: ctx.organizationId,
      action: "rule.create",
      entityType: "rule",
      entityId: fm.slug,
      summary: `created file-claimed rule ${fm.slug}`,
      after: { fm },
      invokedVia,
    });
    return;
  }

  if (diff.op === "modified" && diff.existing && diff.fm) {
    const file = await readRuleBody(ctx, diff.path!);
    await db
      .update(rules)
      .set({
        title: diff.fm.name,
        body: file ?? diff.existing.body,
        severity: diff.fm.severity ?? diff.existing.severity,
        updatedAt: new Date(),
      })
      .where(eq(rules.id, diff.existing.id));
    await writeMergeAudit({
      organizationId: ctx.organizationId,
      action: "rule.update",
      entityType: "rule",
      entityId: diff.existing.id,
      summary: `updated file-claimed rule ${diff.slug}`,
      before: { body: diff.existing.body },
      after: { fm: diff.fm },
      invokedVia,
    });
  }
}

async function readRuleBody(ctx: MergeSyncContext, path: string): Promise<string | null> {
  const { fetchFileContent } = await import("@/lib/integrations/github-app");
  return await fetchFileContent({
    installationId: ctx.installationId,
    ownerRepo: ctx.ownerRepo,
    ref: ctx.ref,
    path,
  });
}
