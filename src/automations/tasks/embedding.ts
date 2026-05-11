/**
 * embedding.update — Generate/update search embedding for an entity.
 * Triggered by CRUD events via worker rules for configured entity types.
 */

import { db } from "@/db/client";
import { documents } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { generateEmbedding } from "@/lib/embedding";
import { SEARCH_CONFIG } from "@/lib/search/config";

function serializeRow(row: Record<string, unknown>, contentColumns: string[]): string {
  const parts: string[] = [];
  for (const col of contentColumns) {
    const value = row[col];
    if (value != null && value !== "") {
      parts.push(`${col}: ${String(value)}`);
    }
  }
  return parts.join("\n");
}

export async function updateEmbedding(params: {
  organizationId: string;
  entityId: string;
  entityType?: string;
  operation?: string;
  traceId?: string;
  data?: Record<string, unknown>;
}) {
  const { organizationId, entityId, data } = params;

  // Resolve entity type from data or params
  const entityType = params.entityType ?? (data as any)?.entityType;
  if (!entityType) return { skipped: true, reason: "no_entity_type" };

  const config = SEARCH_CONFIG[entityType];
  if (!config) return { skipped: true, reason: "not_configured" };

  // Embeddings are stamped with the creator org. Visibility filtering happens
  // at query time (e.g. candidates → org_candidates join in hybrid search).
  const docOrgId = organizationId;

  const operation = params.operation ?? (data as any)?.operation;

  // DELETE: remove document
  if (operation === "delete") {
    await db
      .delete(documents)
      .where(
        and(
          eq(documents.tableName, config.tableName),
          eq(documents.recordId, entityId),
        ),
      );
    return { success: true, action: "deleted" };
  }

  // INSERT / UPDATE: fetch row, embed, upsert
  const escapedId = entityId.replace(/'/g, "''");
  const result = await db.execute(
    sql.raw(`SELECT * FROM ${config.sourceTable} WHERE id = '${escapedId}'`),
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return { skipped: true, reason: "row_not_found" };

  const content = serializeRow(row, config.contentColumns);
  if (!content.trim()) {
    return { skipped: true, reason: "no_content" };
  }

  const embedding = await generateEmbedding(content);
  if (!embedding) return { skipped: true, reason: "embedding_failed" };

  const metadata: Record<string, unknown> = {};
  for (const col of config.metadataColumns) {
    if (row[col] != null) metadata[col] = row[col];
  }

  // Upsert via ON CONFLICT
  await db
    .insert(documents)
    .values({
      tableName: config.tableName,
      recordId: entityId,
      organizationId: docOrgId,
      content,
      embedding,
      metadata,
    })
    .onConflictDoUpdate({
      target: [documents.tableName, documents.recordId],
      set: {
        content,
        embedding,
        metadata,
        organizationId: docOrgId,
        updatedAt: new Date(),
      },
    });

  return { success: true, action: "upserted" };
}
