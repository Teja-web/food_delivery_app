/**
 * Repo-policy operations.
 *
 * gstack-style three-state trust policy keyed on the canonical git
 * remote. Enforced at the MCP boundary by
 * `src/lib/auth/repo-policy.ts`:enforceRepoPolicy().
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  repoPolicies,
  type RepoPolicy,
  type RepoPolicyRow,
} from "@/db/schema/repo-policy";
import { getActionContext } from "@/lib/auth/context";
import { canonicalizeRemote } from "@/domain/git-remote";

export async function listRepoPolicies(organizationId?: string): Promise<RepoPolicyRow[]> {
  const ctx = await getActionContext();
  const orgId = organizationId ?? ctx.organizationId;
  return db
    .select()
    .from(repoPolicies)
    .where(eq(repoPolicies.organizationId, orgId));
}

export async function getPolicyForRemote(
  organizationId: string,
  remoteUrl: string,
): Promise<RepoPolicyRow | null> {
  const remoteCanonical = canonicalizeRemote(remoteUrl);
  const [row] = await db
    .select()
    .from(repoPolicies)
    .where(
      and(
        eq(repoPolicies.organizationId, organizationId),
        eq(repoPolicies.remoteCanonical, remoteCanonical),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function setRepoPolicy(
  organizationId: string,
  remoteUrl: string,
  policy: RepoPolicy,
  options: { projectId?: string | null; actorId?: string; actorName?: string } = {},
): Promise<RepoPolicyRow> {
  const remoteCanonical = canonicalizeRemote(remoteUrl);
  const existing = await getPolicyForRemote(organizationId, remoteUrl);
  if (existing) {
    const [row] = await db
      .update(repoPolicies)
      .set({
        policy,
        projectId: options.projectId ?? existing.projectId,
        updatedAt: new Date(),
        updatedById: options.actorId ?? null,
        updatedByName: options.actorName ?? null,
      })
      .where(eq(repoPolicies.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(repoPolicies)
    .values({
      organizationId,
      remoteCanonical,
      policy,
      projectId: options.projectId ?? null,
      createdById: options.actorId ?? null,
      createdByName: options.actorName ?? null,
    })
    .returning();
  return row;
}

/**
 * Auto-create on first touch — invoked from `session_start` when the
 * caller declares a `repoUrl` we haven't seen before. Defaults to
 * read-write; operators tighten via `/settings/repos`.
 *
 * Idempotent: if a row already exists for `(orgId, remoteCanonical)`,
 * returns it unchanged.
 */
export async function autoCreateOnFirstTouch(
  organizationId: string,
  remoteUrl: string,
  options: { projectId?: string | null; actorId?: string; actorName?: string } = {},
): Promise<{ row: RepoPolicyRow; created: boolean }> {
  const existing = await getPolicyForRemote(organizationId, remoteUrl);
  if (existing) return { row: existing, created: false };
  const row = await setRepoPolicy(organizationId, remoteUrl, "read-write", options);
  return { row, created: true };
}
