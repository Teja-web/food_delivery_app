"use server";

import { nanoid } from "nanoid";
import { db } from "@/db/client";
import { entityNotes, type EntityNoteType } from "@/db/schema/entity-notes";
import { getActionContext } from "@/lib/auth/context";
import { and, eq, desc, inArray } from "drizzle-orm";

/**
 * Notes are deliberately org-wide read/write — anyone in the org can read,
 * edit, or delete any note. Audit fields track who did what. This matches
 * the existing pattern (dismissMatch, editApplication) and avoids per-note
 * authorization complexity.
 *
 * Important: these actions intentionally do NOT call `revalidatePath`.
 * Notes editors autosave on blur, and a page-level revalidation would
 * yank focus mid-typing. Cross-user sync is handled by SSE elsewhere.
 */

export async function addEntityNote(
  entityType: EntityNoteType,
  entityId: string,
  body: string,
) {
  const ctx = await getActionContext();

  const [note] = await db
    .insert(entityNotes)
    .values({
      id: nanoid(),
      entityType,
      entityId,
      body,
      ...ctx.auditCreate(),
    })
    .returning();

  return note;
}

export async function fetchEntityNotes(
  entityType: EntityNoteType,
  entityId: string,
) {
  const ctx = await getActionContext();

  return db
    .select()
    .from(entityNotes)
    .where(
      and(
        eq(entityNotes.organizationId, ctx.organizationId),
        eq(entityNotes.entityType, entityType),
        eq(entityNotes.entityId, entityId),
      ),
    )
    .orderBy(desc(entityNotes.createdAt));
}

export async function updateEntityNote(id: string, body: string) {
  const ctx = await getActionContext();

  const [note] = await db
    .update(entityNotes)
    .set({
      body,
      ...ctx.auditUpdate(),
    })
    .where(
      and(
        eq(entityNotes.id, id),
        eq(entityNotes.organizationId, ctx.organizationId),
      ),
    )
    .returning();

  if (!note) throw new Error("Note not found");
  return note;
}

export async function deleteEntityNote(id: string) {
  const ctx = await getActionContext();

  await db
    .delete(entityNotes)
    .where(
      and(
        eq(entityNotes.id, id),
        eq(entityNotes.organizationId, ctx.organizationId),
      ),
    );
}

/**
 * Apply the same note body to N entities in a single transaction.
 * Used by bulk operations (e.g. shared rejection reason as a per-application note).
 * Returns the inserted note IDs paired with their entityIds.
 */
export async function addEntityNoteBulk(
  entityType: EntityNoteType,
  entityIds: string[],
  body: string,
): Promise<{ id: string; entityId: string }[]> {
  if (entityIds.length === 0) return [];

  const ctx = await getActionContext();
  const audit = ctx.auditCreate();

  const rows = entityIds.map((entityId) => ({
    id: nanoid(),
    entityType,
    entityId,
    body,
    ...audit,
  }));

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(entityNotes)
      .values(rows)
      .returning({ id: entityNotes.id, entityId: entityNotes.entityId });
    return inserted;
  });
}

/**
 * Fetch the most-recent note per entity for a batch of entityIds.
 * Used by serialize layer to surface `lastNotePreview` on row data
 * without N+1 queries.
 */
export async function fetchLatestNotePerEntity(
  entityType: EntityNoteType,
  entityIds: string[],
): Promise<Map<string, { body: string; createdAt: Date; createdByName: string | null }>> {
  if (entityIds.length === 0) return new Map();

  const ctx = await getActionContext();

  const rows = await db
    .select({
      entityId: entityNotes.entityId,
      body: entityNotes.body,
      createdAt: entityNotes.createdAt,
      createdByName: entityNotes.createdByName,
    })
    .from(entityNotes)
    .where(
      and(
        eq(entityNotes.organizationId, ctx.organizationId),
        eq(entityNotes.entityType, entityType),
        inArray(entityNotes.entityId, entityIds),
      ),
    )
    .orderBy(desc(entityNotes.createdAt));

  // First match per entityId wins (rows are already DESC-sorted by createdAt).
  const map = new Map<string, { body: string; createdAt: Date; createdByName: string | null }>();
  for (const row of rows) {
    if (!map.has(row.entityId)) {
      map.set(row.entityId, {
        body: row.body,
        createdAt: row.createdAt,
        createdByName: row.createdByName,
      });
    }
  }
  return map;
}
