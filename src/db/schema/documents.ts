import { text, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";

export const documents = cozntSchema.table("documents", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  tableName: text("table_name").notNull(),
  recordId: text("record_id").notNull(),
  organizationId: text("organization_id").notNull(),
  content: text("content"),
  embedding: vector("embedding", { dimensions: 1536 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("coznt_documents_table_record_uniq").on(table.tableName, table.recordId),
  index("coznt_documents_org_idx").on(table.organizationId),
  index("coznt_documents_table_idx").on(table.tableName),
  index("coznt_documents_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
]);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
