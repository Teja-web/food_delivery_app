/**
 * Embed project_learnings rows into `coznt.documents` for semantic search.
 *
 * Wired on insert + update of `project_learnings`. The worker calls this
 * task with the row id; we fetch the body, generate an embedding via the
 * configured provider, and upsert by `(tableName, recordId)`.
 *
 * Soft-deletes (rows with `deletedAt` set) cause the `documents` row to
 * be removed so search results stay clean.
 */

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { documents } from "@/db/schema/documents";
import { projectLearnings } from "@/db/schema/plan/project-learning";
import { generateEmbedding } from "@/lib/embedding";
import { createLogger } from "@/lib/logger";
import type { TaskParams } from "@/automations/task-router";

const log = createLogger("embed-project-learning");
const TABLE_NAME = "project_learnings";

export async function embedProjectLearningTask(params: TaskParams): Promise<void> {
  const row = await db.query.projectLearnings.findFirst({
    where: eq(projectLearnings.id, params.entityId),
  });
  if (!row) {
    log.warn(`project_learning ${params.entityId} not found`);
    return;
  }

  // Soft-deleted → drop from search index.
  if (row.deletedAt !== null) {
    await db
      .delete(documents)
      .where(and(eq(documents.tableName, TABLE_NAME), eq(documents.recordId, row.id)));
    log.info(`removed embedding for soft-deleted learning ${row.id}`);
    return;
  }

  // Cap input length — learnings are notes, not long-form docs. Embedding
  // truncation happens inside the provider but we also cap here to avoid
  // burning tokens on accidental long payloads.
  const text = row.body.slice(0, 8000);
  const embedding = await generateEmbedding(text);
  if (!embedding) {
    log.warn(`no embedding generated for ${row.id} (provider missing or failed)`);
    return;
  }

  // Vectors come back as number[]; pgvector expects the `[v1,v2,...]` text form.
  const embeddingStr = `[${embedding.join(",")}]`;

  // Upsert by the (table_name, record_id) unique constraint.
  await db
    .insert(documents)
    .values({
      organizationId: row.organizationId,
      tableName: TABLE_NAME,
      recordId: row.id,
      content: row.body,
      embedding: sql`${embeddingStr}::vector`,
    })
    .onConflictDoUpdate({
      target: [documents.tableName, documents.recordId],
      set: {
        content: row.body,
        embedding: sql`${embeddingStr}::vector`,
        organizationId: row.organizationId,
      },
    });
  log.info(`embedded learning ${row.id} (${text.length} chars)`);
}
