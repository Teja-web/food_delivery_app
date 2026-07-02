/**
 * API Keys — mint / list / revoke bearer tokens for the `/api/v1` agent surface.
 *
 * On `mintApiKey`, the plaintext is generated server-side, stored as
 * `sha256(plaintext)`, and returned exactly once. The caller is expected
 * to display it to the user immediately and never persist it again.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { db } from "@/db/client";
import { apiKeys, type ApiKey } from "@/db/schema/api-key";
import { user } from "@/db/schema/auth";
import { projects } from "@/db/schema/project";
import { assertOwnerRole, getActionContext } from "@/lib/auth/context";
import {
  parseApiKeyRole,
  type ApiKeyRole,
} from "@/lib/auth/api-key-roles";
import { safeRevalidate } from "@/lib/safe-revalidate";

export interface ApiKeyWithContext extends ApiKey {
  projectName: string | null;
  projectSlug: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
}

const KEY_BYTES = 32;
const PREFIX_CHARS = 8;

function generatePlaintext(): string {
  return `dlz_${randomBytes(KEY_BYTES).toString("base64url")}`;
}

function hash(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export interface MintInput {
  name: string;
  projectId: string;
  role?: ApiKeyRole | string | null;
  expiresAt?: Date | null;
}

export interface MintResult {
  id: string;
  plaintext: string;
  prefix: string;
}

export async function mintApiKey(input: MintInput): Promise<MintResult> {
  const ctx = await getActionContext();
  assertOwnerRole(ctx, "Creating API keys");
  const role = parseApiKeyRole(input.role);

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, ctx.organizationId)))
    .limit(1);
  if (!project) {
    throw new Error("Project not found in this organization");
  }

  const plaintext = generatePlaintext();
  const prefix = plaintext.slice(0, PREFIX_CHARS);

  const [row] = await db
    .insert(apiKeys)
    .values({
      organizationId: ctx.organizationId,
      projectId: input.projectId,
      name: input.name,
      prefix,
      keyHash: hash(plaintext),
      role,
      createdById: ctx.userId,
      expiresAt: input.expiresAt ?? null,
    })
    .returning({ id: apiKeys.id });

  await safeRevalidate("/api-keys");
  await safeRevalidate(`/projects/${input.projectId}/settings`);
  return { id: row.id, plaintext, prefix };
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const ctx = await getActionContext();
  return db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, ctx.organizationId))
    .orderBy(desc(apiKeys.createdAt));
}

/**
 * Org-wide listing enriched with project and creator info. Used by the
 * org-level audit view at `/api-keys`. Keeps the page to a single query
 * regardless of org size.
 */
export async function listApiKeysWithContext(): Promise<ApiKeyWithContext[]> {
  const ctx = await getActionContext();
  const rows = await db
    .select({
      key: apiKeys,
      projectName: projects.name,
      projectSlug: projects.slug,
      createdByName: user.name,
      createdByEmail: user.email,
    })
    .from(apiKeys)
    .leftJoin(projects, eq(projects.id, apiKeys.projectId))
    .leftJoin(user, eq(user.id, apiKeys.createdById))
    .where(eq(apiKeys.organizationId, ctx.organizationId))
    .orderBy(desc(apiKeys.createdAt));

  return rows.map((r) => ({
    ...r.key,
    projectName: r.projectName,
    projectSlug: r.projectSlug,
    createdByName: r.createdByName,
    createdByEmail: r.createdByEmail,
  }));
}

export async function listApiKeysForProject(projectId: string): Promise<ApiKey[]> {
  const ctx = await getActionContext();
  return db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.organizationId, ctx.organizationId),
        eq(apiKeys.projectId, projectId),
      ),
    )
    .orderBy(desc(apiKeys.createdAt));
}

/**
 * Read-only: return the prefix of the most recent active project-scoped key,
 * or null if none. The Connect-IDE panel uses this to show either the snippet
 * or an empty-state. Minting is an explicit user action on the API keys page —
 * never a side-effect of a server render.
 */
export async function getActiveProjectKey(
  projectId: string,
): Promise<{ prefix: string } | null> {
  const ctx = await getActionContext();
  const [existing] = await db
    .select({ prefix: apiKeys.prefix })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.organizationId, ctx.organizationId),
        eq(apiKeys.projectId, projectId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .orderBy(desc(apiKeys.createdAt))
    .limit(1);

  return existing ? { prefix: existing.prefix } : null;
}

export async function revokeApiKey(id: string): Promise<void> {
  const ctx = await getActionContext();
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, ctx.organizationId)))
    .returning({ projectId: apiKeys.projectId });
  await safeRevalidate("/api-keys");
  if (row?.projectId) {
    await safeRevalidate(`/projects/${row.projectId}/settings`);
  }
}
