/**
 * Shared helpers for the three `.agents/*` merge-webhook sync tasks
 * (`sync-skills-from-merge`, `sync-rules-from-merge`, `sync-plans-from-merge`).
 *
 * These tasks all share the same skeleton:
 *   1. Fetch the repo tree at the merge SHA
 *   2. Filter to the artifact's discovery paths
 *   3. Fetch each file's content
 *   4. Parse frontmatter, validate against the per-kind Zod schema
 *   5. Diff vs. current DB rows (`claimed_path`-scoped)
 *   6. Route per docs/spec/dev-authoring-surface.md §12 (direct DB write
 *      vs. governance_records.review/approval)
 *
 * This file owns steps 1-3 and the common audit-log emission helpers; each
 * per-artifact task owns steps 4-6.
 */

import { db } from "@/db/client";
import { auditLogs } from "@/db/schema/audit/audit-log";
import {
  fetchFileContent,
  listRepoTree,
} from "@/lib/integrations/github-app";
import { parseFrontmatter, type ParsedFrontmatter, FrontmatterParseError } from "@/lib/authoring/parse-frontmatter";
import { parseCozntConfig, resolveAuthoringPaths, type ResolvedAuthoringPaths } from "@/lib/authoring/coznt-config";

export interface MergeSyncContext {
  organizationId: string;
  projectId: string;
  installationId: string;
  ownerRepo: string;
  /** Commit SHA (or ref) to read from. */
  ref: string;
  /** PR number if the merge originated from one (used in audit_logs.invokedVia). */
  prNumber?: number | null;
  /** When true, skip DB writes; just return the proposed diff for preview. */
  preview?: boolean;
  /**
   * Skill / rule slugs pre-approved by an org-admin via `coznt:approve <slug>`
   * PR comment per spec §13. When a diff would normally route to `review`,
   * pre-approval short-circuits it to direct-apply with an audit_logs entry
   * citing the approving comment author.
   */
  preApprovedSlugs?: Set<string>;
}

export interface DiscoveredFile {
  /** Repo-relative path (e.g. ".agents/skills/migration-safety-reviewer.md"). */
  path: string;
  /** Raw file contents at the ref. */
  content: string;
  /** Parsed frontmatter + body. */
  parsed: ParsedFrontmatter;
}

/**
 * Discover candidate authoring files under a set of directory prefixes.
 * Reads the repo tree once, filters to matching `.md` files, and fetches
 * each one's contents. Files with malformed frontmatter come back with
 * `parseError` set so the caller can surface them in the check-run.
 */
export async function discoverFiles(
  ctx: MergeSyncContext,
  prefixes: string[],
): Promise<{
  files: DiscoveredFile[];
  errors: Array<{ path: string; message: string }>;
  truncated: boolean;
}> {
  const tree = await listRepoTree({
    installationId: ctx.installationId,
    ownerRepo: ctx.ownerRepo,
    ref: ctx.ref,
  });
  if (!tree) return { files: [], errors: [], truncated: false };

  const matches = tree.paths.filter(
    (p) =>
      p.endsWith(".md") &&
      prefixes.some((prefix) => p.startsWith(prefix)) &&
      !p.endsWith("/README.md"),
  );

  const files: DiscoveredFile[] = [];
  const errors: Array<{ path: string; message: string }> = [];

  for (const path of matches) {
    const content = await fetchFileContent({
      installationId: ctx.installationId,
      ownerRepo: ctx.ownerRepo,
      ref: ctx.ref,
      path,
    });
    if (content === null) continue;
    try {
      const parsed = parseFrontmatter(content, path);
      files.push({ path, content, parsed });
    } catch (err) {
      const message = err instanceof FrontmatterParseError ? err.message : String(err);
      errors.push({ path, message });
    }
  }

  return { files, errors, truncated: tree.truncated };
}

/**
 * Resolve effective authoring paths by reading `.agents/coznt.yaml` (if any)
 * and merging with defaults. Caches per-call only.
 */
export async function loadAuthoringPaths(ctx: MergeSyncContext): Promise<ResolvedAuthoringPaths> {
  const content = await fetchFileContent({
    installationId: ctx.installationId,
    ownerRepo: ctx.ownerRepo,
    ref: ctx.ref,
    path: ".agents/coznt.yaml",
  });
  if (!content) return resolveAuthoringPaths(null);
  try {
    return resolveAuthoringPaths(parseCozntConfig(content));
  } catch {
    // Fall back to defaults on parse failure; the check-run surfaces the
    // error separately via discoverFiles' errors list.
    return resolveAuthoringPaths(null);
  }
}

interface AuditWriteInput {
  organizationId: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  invokedVia: string;
}

export async function writeMergeAudit(input: AuditWriteInput): Promise<void> {
  await db.insert(auditLogs).values({
    organizationId: input.organizationId,
    actorType: "system",
    actorId: "merge-webhook",
    actorName: "merge-webhook",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    before: input.before ?? null,
    after: input.after ?? null,
    invokedVia: input.invokedVia,
  });
}

/**
 * Compute the diff verdict for a per-row sync — added vs modified vs removed
 * vs unchanged. Used by per-artifact tasks for routing per §12.
 */
export function diffOp<T extends { body?: string | null }>(
  existing: T | null,
  incoming: T | null,
): "added" | "modified" | "removed" | "unchanged" {
  if (existing && !incoming) return "removed";
  if (!existing && incoming) return "added";
  if (!existing && !incoming) return "unchanged";
  // Both exist — caller compares relevant fields. We return "modified" by
  // default and let the per-artifact task decide what counts as material.
  return "modified";
}

/**
 * Order an apply batch per §12: removes → modifies → adds. A rename
 * (add new slug + remove old) never transiently leaves the project missing
 * the artifact.
 */
export function orderForApply<T extends { op: "added" | "modified" | "removed" }>(rows: T[]): T[] {
  const order = { removed: 0, modified: 1, added: 2 } as const;
  return [...rows].sort((a, b) => order[a.op] - order[b.op]);
}
