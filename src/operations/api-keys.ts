/**
 * API Keys — mint / list / revoke bearer tokens for the `/api/v1` agent surface.
 *
 * On `mintApiKey`, the plaintext is generated server-side, stored as
 * `sha256(plaintext)`, and returned exactly once. The caller is expected
 * to display it to the user immediately and never persist it again.
 */

import { and, desc, eq } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { db } from "@/db/client";
import { apiKeys, type ApiKey } from "@/db/schema/api-key";
import { projects } from "@/db/schema/project";
import { getActionContext } from "@/lib/auth/context";
import { safeRevalidate } from "@/lib/safe-revalidate";

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
  expiresAt?: Date | null;
}

export interface MintResult {
  id: string;
  plaintext: string;
  prefix: string;
}

export async function mintApiKey(input: MintInput): Promise<MintResult> {
  const ctx = await getActionContext();

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
      createdById: ctx.userId,
      expiresAt: input.expiresAt ?? null,
    })
    .returning({ id: apiKeys.id });

  await safeRevalidate("/api-keys");
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
 * Find the most recent project-scoped key, or mint one if none exists.
 * Used by the H2 cockpit's "Connect Cursor" modal. If a key exists, the
 * plaintext is unrecoverable — only the prefix is returned. If none
 * exists, mints one and returns `{ plaintext, isNew: true }`.
 */
export async function getOrCreateProjectKey(
  projectId: string,
  name = "Cursor MCP",
): Promise<{ prefix: string; plaintext: string | null; isNew: boolean }> {
  const ctx = await getActionContext();
  const [existing] = await db
    .select({ prefix: apiKeys.prefix })
    .from(apiKeys)
    .where(
      and(eq(apiKeys.organizationId, ctx.organizationId), eq(apiKeys.projectId, projectId)),
    )
    .orderBy(desc(apiKeys.createdAt))
    .limit(1);

  if (existing) {
    return { prefix: existing.prefix, plaintext: null, isNew: false };
  }
  const minted = await mintApiKey({ name, projectId });
  return { prefix: minted.prefix, plaintext: minted.plaintext, isNew: true };
}

export async function revokeApiKey(id: string): Promise<void> {
  const ctx = await getActionContext();
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, ctx.organizationId)));
  await safeRevalidate("/api-keys");
}
