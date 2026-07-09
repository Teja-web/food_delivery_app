/**
 * Custom-choreography operations.
 *
 * Customer-authored workflow guides distributed alongside platform
 * choreographies via `sync_choreographies`. Validates frontmatter on
 * every write — same JSON Schema the platform choreographies use.
 */

import { createHash } from "node:crypto";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  customChoreographies,
  type CustomChoreography,
} from "@/db/schema/custom-choreography";
import { getActionContext } from "@/lib/auth/context";

export class ChoreographyValidationError extends Error {
  status = 422;
  constructor(public readonly errors: string[]) {
    super(`${errors.length} validation error(s): ${errors.join("; ")}`);
    this.name = "ChoreographyValidationError";
  }
}

/**
 * Minimal frontmatter validator — mirrors the JSON Schema at
 * `src/automations/skills/choreography-frontmatter.schema.json`. Kept
 * inline to avoid importing the linter (which is a script). Same
 * shape that `scripts/lint-choreographies.ts` validates.
 */
export function validateChoreographyBody(body: string): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const match = body.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    errors.push("missing YAML frontmatter (must start with --- ... ---)");
    return { ok: false, errors };
  }
  const yaml = match[1];

  // Minimal YAML parse — same approach as the linter.
  const raw: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let inCoznt = false;
  const coznt: Record<string, unknown> = {};
  const cozntListBuf: { key: string | null; items: string[] } = { key: null, items: [] };

  for (const line of lines) {
    if (/^coznt:\s*$/.test(line)) {
      inCoznt = true;
      continue;
    }
    if (inCoznt && /^\s+([a-zA-Z_-]+):\s*$/.test(line)) {
      // start of a nested list
      if (cozntListBuf.key) {
        coznt[cozntListBuf.key] = [...cozntListBuf.items];
        cozntListBuf.items = [];
      }
      const m = line.match(/^\s+([a-zA-Z_-]+):\s*$/);
      cozntListBuf.key = m![1];
      continue;
    }
    if (inCoznt && /^\s{4,}-\s+(.+)$/.test(line) && cozntListBuf.key) {
      const m = line.match(/^\s{4,}-\s+(.+)$/);
      cozntListBuf.items.push(m![1].trim());
      continue;
    }
    if (inCoznt && /^\s+([a-zA-Z_-]+):\s*(.+)$/.test(line)) {
      // flush any open list
      if (cozntListBuf.key) {
        coznt[cozntListBuf.key] = [...cozntListBuf.items];
        cozntListBuf.key = null;
        cozntListBuf.items = [];
      }
      const m = line.match(/^\s+([a-zA-Z_-]+):\s*(.+)$/);
      if (m) coznt[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      continue;
    }
    if (/^[a-zA-Z_-]+:/.test(line) && !line.startsWith("  ")) {
      // back to top-level
      if (inCoznt && cozntListBuf.key) {
        coznt[cozntListBuf.key] = [...cozntListBuf.items];
        cozntListBuf.key = null;
        cozntListBuf.items = [];
      }
      inCoznt = false;
      const m = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
      if (m) raw[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  // Flush final list
  if (cozntListBuf.key) {
    coznt[cozntListBuf.key] = [...cozntListBuf.items];
  }

  // Required top-level
  if (typeof raw.name !== "string" || !raw.name) errors.push("`name` is required");
  if (typeof raw.description !== "string" || raw.description.length < 10) {
    errors.push("`description` is required and must be at least 10 chars");
  }
  // Required coznt block
  if (Object.keys(coznt).length === 0) {
    errors.push("`coznt:` namespace block is required");
  } else {
    if (typeof coznt.version !== "string" || !/^\d+\.\d+\.\d+$/.test(coznt.version)) {
      errors.push("`coznt.version` must match semver (x.y.z)");
    }
    if (!Array.isArray(coznt.required_verbs) || coznt.required_verbs.length === 0) {
      errors.push("`coznt.required_verbs` must be a non-empty array");
    }
    if (coznt.min_autonomy !== undefined) {
      const allowed = ["observe", "propose", "merge", "lead"];
      if (
        typeof coznt.min_autonomy !== "string" ||
        !allowed.includes(coznt.min_autonomy as string)
      ) {
        errors.push(`\`coznt.min_autonomy\` must be one of ${allowed.join(" | ")}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export interface CreateCustomChoreographyInput {
  slug: string;
  name: string;
  body: string;
  projectId?: string | null;
  version?: string;
}

export async function createCustomChoreography(
  input: CreateCustomChoreographyInput,
): Promise<CustomChoreography> {
  const ctx = await getActionContext();

  const validation = validateChoreographyBody(input.body);
  if (!validation.ok) throw new ChoreographyValidationError(validation.errors);

  const [row] = await db
    .insert(customChoreographies)
    .values({
      organizationId: ctx.organizationId,
      projectId: input.projectId ?? null,
      slug: input.slug,
      name: input.name,
      body: input.body,
      version: input.version ?? "1.0.0",
      createdById: ctx.userId,
      createdByName: ctx.user.name,
    })
    .returning();
  return row;
}

export async function listCustomChoreographies(
  projectId: string | null,
): Promise<CustomChoreography[]> {
  const ctx = await getActionContext();
  return db
    .select()
    .from(customChoreographies)
    .where(
      and(
        eq(customChoreographies.organizationId, ctx.organizationId),
        eq(customChoreographies.enabled, true),
        isNull(customChoreographies.deletedAt),
        projectId
          ? or(eq(customChoreographies.projectId, projectId), isNull(customChoreographies.projectId))
          : isNull(customChoreographies.projectId),
      ),
    )
    .orderBy(desc(customChoreographies.updatedAt));
}

export async function getCustomChoreographyById(id: string): Promise<CustomChoreography | null> {
  const ctx = await getActionContext();
  const [row] = await db
    .select()
    .from(customChoreographies)
    .where(
      and(
        eq(customChoreographies.id, id),
        eq(customChoreographies.organizationId, ctx.organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateCustomChoreography(
  id: string,
  input: Partial<{ name: string; body: string; version: string; enabled: boolean }>,
): Promise<CustomChoreography> {
  const ctx = await getActionContext();
  if (input.body) {
    const validation = validateChoreographyBody(input.body);
    if (!validation.ok) throw new ChoreographyValidationError(validation.errors);
  }
  const [row] = await db
    .update(customChoreographies)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.body !== undefined && { body: input.body }),
      ...(input.version !== undefined && { version: input.version }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      updatedAt: new Date(),
      updatedById: ctx.userId,
      updatedByName: ctx.user.name,
    })
    .where(
      and(
        eq(customChoreographies.id, id),
        eq(customChoreographies.organizationId, ctx.organizationId),
      ),
    )
    .returning();
  return row;
}

export async function softDeleteCustomChoreography(id: string): Promise<void> {
  const ctx = await getActionContext();
  await db
    .update(customChoreographies)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(customChoreographies.id, id),
        eq(customChoreographies.organizationId, ctx.organizationId),
      ),
    );
}

/**
 * Build the manifest entry shape `list_custom_choreographies` returns.
 * Hash is SHA-256 of the body — same algorithm as platform choreographies.
 */
export interface CustomChoreographyManifestEntry {
  slug: string;
  version: string;
  hash: string;
  name: string;
  scope: "project" | "org";
}

export async function listCustomManifest(
  projectId: string | null,
): Promise<CustomChoreographyManifestEntry[]> {
  const rows = await listCustomChoreographies(projectId);
  return rows.map((r) => ({
    slug: r.slug,
    version: r.version,
    hash: createHash("sha256").update(r.body, "utf-8").digest("hex"),
    name: r.name,
    scope: r.projectId ? "project" : "org",
  }));
}
