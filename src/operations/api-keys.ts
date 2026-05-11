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
  projectId?: string | null;
  expiresAt?: Date | null;
}

export interface MintResult {
  id: string;
  plaintext: string;
  prefix: string;
}

export async function mintApiKey(input: MintInput): Promise<MintResult> {
  const ctx = await getActionContext();
  const plaintext = generatePlaintext();
  const prefix = plaintext.slice(0, PREFIX_CHARS);

  const [row] = await db
    .insert(apiKeys)
    .values({
      organizationId: ctx.organizationId,
      projectId: input.projectId ?? null,
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

export async function revokeApiKey(id: string): Promise<void> {
  const ctx = await getActionContext();
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, ctx.organizationId)));
  await safeRevalidate("/api-keys");
}
