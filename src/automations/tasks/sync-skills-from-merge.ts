/**
 * Sync `.agents/skills/*.md` files into the `skills` table on default-branch
 * push. Per docs/spec/dev-authoring-surface.md §12, the routing table:
 *
 *   Added skill, requiredLevel ≤ 1  → direct DB write + audit
 *   Added skill, requiredLevel ≥ 2  → governance_records.review
 *   Modified body / sensitivity     → direct DB write + audit
 *   Modified requiredLevel up /
 *     riskClass down                → governance_records.review
 *   Removed skill                   → governance_records.approval (reason req.)
 *
 * This task only touches file-claimed rows (`claimed_path IS NOT NULL`).
 * Web-app-authored skills are out of scope.
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { skills, type Skill } from "@/db/schema/skill/skill";
import { governanceRecordCrud } from "@/operations/governance/records";
import { skillFileFrontmatterSchema, type SkillFileFrontmatter } from "@/lib/authoring/schemas";
import {
  discoverFiles,
  loadAuthoringPaths,
  orderForApply,
  writeMergeAudit,
  type MergeSyncContext,
} from "./sync-shared";

export interface SkillSyncDiff {
  op: "added" | "modified" | "removed";
  slug: string;
  path: string | null;
  fm: SkillFileFrontmatter | null;
  existing: Skill | null;
  routedTo: "direct" | "review" | "approval";
  reason: string;
}

export interface SkillSyncResult {
  applied: SkillSyncDiff[];
  parseErrors: Array<{ path: string; message: string }>;
}

const REVIEW_TRIGGER_LEVEL = 2;

export async function syncSkillsFromMerge(ctx: MergeSyncContext): Promise<SkillSyncResult> {
  const paths = await loadAuthoringPaths(ctx);
  const { files, errors } = await discoverFiles(ctx, [paths.skills]);

  // Build incoming map (slug → frontmatter), filtering invalid frontmatter
  // into `errors` for the check-run.
  const incoming = new Map<string, { path: string; fm: SkillFileFrontmatter; body: string }>();
  for (const f of files) {
    const result = skillFileFrontmatterSchema.safeParse(f.parsed.data);
    if (!result.success) {
      errors.push({
        path: f.path,
        message: `invalid skill frontmatter: ${result.error.message}`,
      });
      continue;
    }
    const slug = result.data.slug;
    if (incoming.has(slug)) {
      errors.push({
        path: f.path,
        message: `duplicate skill slug "${slug}" (also in ${incoming.get(slug)!.path})`,
      });
      continue;
    }
    incoming.set(slug, { path: f.path, fm: result.data, body: f.parsed.body.trim() });
  }

  // Existing file-claimed skills for this project (or org-wide when project
  // is null — though the merge webhook always scopes to a project).
  const existing = await db.query.skills.findMany({
    where: and(
      eq(skills.organizationId, ctx.organizationId),
      eq(skills.projectId, ctx.projectId),
      isNotNull(skills.claimedPath),
    ),
  });
  const existingBySlug = new Map(existing.map((s) => [s.slug, s]));

  const diffs: SkillSyncDiff[] = [];

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
      reason: "removal requires explicit approval per §12",
    });
  }

  // Added / modified
  for (const [slug, { path, fm, body }] of incoming) {
    const existingRow = existingBySlug.get(slug) ?? null;
    if (!existingRow) {
      const requiredLevel = fm.requiredLevel ?? 0;
      const wouldReview = requiredLevel >= REVIEW_TRIGGER_LEVEL;
      const preApproved = wouldReview && ctx.preApprovedSlugs?.has(slug);
      const route: "direct" | "review" =
        !wouldReview || preApproved ? "direct" : "review";
      diffs.push({
        op: "added",
        slug,
        path,
        fm,
        existing: null,
        routedTo: route,
        reason: preApproved
          ? `level ${requiredLevel} pre-approved via coznt:approve PR comment`
          : route === "direct"
            ? `level ${requiredLevel} below review threshold`
            : `level ${requiredLevel} ≥ ${REVIEW_TRIGGER_LEVEL} requires org-admin review`,
      });
      continue;
    }

    const bodyChanged = (existingRow.body ?? "").trim() !== body;
    const oldLevel = existingRow.minAutonomyLevel ?? 0;
    const newLevel = fm.requiredLevel ?? 0;
    const oldRisk = existingRow.riskClass ?? "medium";
    const newRisk = fm.riskClass ?? "medium";
    const levelRose = newLevel > oldLevel;
    const riskFell = riskOrder(newRisk) < riskOrder(oldRisk);

    if (!bodyChanged && oldLevel === newLevel && oldRisk === newRisk) {
      // No material change — but config (triggers, sensitivity) might still differ;
      // treat that as a body/sensitivity-only modify (auto-apply).
      const oldCfg = JSON.stringify(existingRow.config ?? {});
      const newCfg = JSON.stringify(buildSkillConfig(fm));
      if (oldCfg === newCfg && existingRow.name === fm.name && existingRow.description === fm.description) {
        continue;
      }
    }

    const wouldReview = levelRose || riskFell;
    const preApproved = wouldReview && ctx.preApprovedSlugs?.has(slug);
    const route: "direct" | "review" = !wouldReview || preApproved ? "direct" : "review";
    diffs.push({
      op: "modified",
      slug,
      path,
      fm,
      existing: existingRow,
      routedTo: route,
      reason: preApproved
        ? `pre-approved via coznt:approve PR comment`
        : route === "direct"
          ? "prompt body / sensitivity / config update — auto-apply"
          : levelRose
            ? `required level ${oldLevel} → ${newLevel} requires review`
            : `risk class ${oldRisk} → ${newRisk} (downgrade) requires review`,
    });
  }

  if (ctx.preview) {
    return { applied: diffs, parseErrors: errors };
  }

  // Apply per §12: removes → modifies → adds, atomic per slug.
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

function riskOrder(r: string): number {
  switch (r) {
    case "low":
      return 0;
    case "medium":
      return 1;
    case "high":
      return 2;
    case "critical":
      return 3;
    default:
      return 1;
  }
}

function buildSkillConfig(fm: SkillFileFrontmatter): Record<string, unknown> {
  const cfg: Record<string, unknown> = {};
  if (fm.model) cfg.model = fm.model;
  if (fm.sensitivity) cfg.sensitivity = fm.sensitivity;
  if (fm.triggers && fm.triggers.length > 0) cfg.triggers = fm.triggers;
  return cfg;
}

async function applyOne(ctx: MergeSyncContext, diff: SkillSyncDiff): Promise<void> {
  const invokedVia = ctx.prNumber
    ? `merge-webhook:pr#${ctx.prNumber}`
    : "merge-webhook:push";

  if (diff.routedTo === "review") {
    await openGovernanceRecord(ctx, diff, "review");
    await writeMergeAudit({
      organizationId: ctx.organizationId,
      action: `skill.${diff.op}.review-pending`,
      entityType: "skill",
      entityId: diff.existing?.id ?? diff.slug,
      summary: `${diff.op}: ${diff.slug} — ${diff.reason}`,
      after: diff.fm ? { fm: diff.fm } : null,
      invokedVia,
    });
    return;
  }

  if (diff.routedTo === "approval") {
    await openGovernanceRecord(ctx, diff, "approval");
    await writeMergeAudit({
      organizationId: ctx.organizationId,
      action: `skill.${diff.op}.approval-pending`,
      entityType: "skill",
      entityId: diff.existing?.id ?? diff.slug,
      summary: `${diff.op}: ${diff.slug} — ${diff.reason}`,
      invokedVia,
    });
    return;
  }

  // Direct DB write
  if (diff.op === "added" && diff.fm && diff.path) {
    const fm = diff.fm;
    const file = await findBodyForDiff(ctx, diff);
    await db.insert(skills).values({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      slug: fm.slug,
      name: fm.name,
      description: fm.description,
      body: file ?? "",
      minAutonomyLevel: fm.requiredLevel ?? 0,
      riskClass: fm.riskClass ?? "medium",
      claimedPath: diff.path,
      config: buildSkillConfig(fm),
      enabled: true,
    });
    await writeMergeAudit({
      organizationId: ctx.organizationId,
      action: "skill.create",
      entityType: "skill",
      entityId: fm.slug,
      summary: `created file-claimed skill ${fm.slug}`,
      after: { fm },
      invokedVia,
    });
    return;
  }

  if (diff.op === "modified" && diff.existing && diff.fm) {
    const file = await findBodyForDiff(ctx, diff);
    await db
      .update(skills)
      .set({
        name: diff.fm.name,
        description: diff.fm.description,
        body: file ?? diff.existing.body,
        config: buildSkillConfig(diff.fm),
        updatedAt: new Date(),
      })
      .where(eq(skills.id, diff.existing.id));
    await writeMergeAudit({
      organizationId: ctx.organizationId,
      action: "skill.update",
      entityType: "skill",
      entityId: diff.existing.id,
      summary: `updated file-claimed skill ${diff.slug}`,
      before: { body: diff.existing.body, config: diff.existing.config },
      after: { fm: diff.fm },
      invokedVia,
    });
  }
}

async function findBodyForDiff(ctx: MergeSyncContext, diff: SkillSyncDiff): Promise<string | null> {
  if (!diff.path) return null;
  // Re-fetch through discoverFiles' parser-friendly pipeline is overkill here —
  // body was already parsed into the diff object via incoming. But the diff
  // shape doesn't carry it (intentional, to keep the type small). Re-read.
  const { fetchFileContent } = await import("@/lib/integrations/github-app");
  const { parseFrontmatter } = await import("@/lib/authoring/parse-frontmatter");
  const content = await fetchFileContent({
    installationId: ctx.installationId,
    ownerRepo: ctx.ownerRepo,
    ref: ctx.ref,
    path: diff.path,
  });
  if (!content) return null;
  return parseFrontmatter(content, diff.path).body.trim();
}

async function openGovernanceRecord(
  ctx: MergeSyncContext,
  diff: SkillSyncDiff,
  kind: "review" | "approval",
): Promise<void> {
  // Skill changes don't have a plan_artifactId. We create a record attached
  // to a sentinel plan_artifact representing the skill change — or, simpler
  // for MVP, write an audit entry that surfaces in the inbox via the
  // existing skill-changes view. The governance_records table requires
  // planArtifactId NOT NULL, so for skill/rule definition changes we use the
  // audit_logs path only and the web app surfaces these under
  // /governance/inbox?artifact=skill via a dedicated query.
  //
  // Per spec §12 / §11.5 J10, autonomy/definition overrides are NOT
  // governance_records — they're a separate mechanism. Keep this consistent:
  // write a richly-typed audit entry. The web app's skill-changes inbox reads
  // these and renders approve/reject UI.
  await writeMergeAudit({
    organizationId: ctx.organizationId,
    action: `skill.${diff.op}.${kind}-pending`,
    entityType: "skill",
    entityId: diff.existing?.id ?? diff.slug,
    summary: `${diff.op}: ${diff.slug} routed to ${kind}: ${diff.reason}`,
    after: diff.fm ? { fm: diff.fm, route: kind, claimedPath: diff.path } : { route: kind },
    invokedVia: ctx.prNumber
      ? `merge-webhook:pr#${ctx.prNumber}`
      : "merge-webhook:push",
  });
  // Mark the variable as used to satisfy lint; the helper is wired through
  // for when skill-changes get hooked into governance_records directly in v1.1.
  void governanceRecordCrud;
}
