import { text, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";

// -- Departments -------------------------------------------------------

export const departments = cozntSchema.table("departments", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  leadUserId: text("lead_user_id"),
  leadName: text("lead_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("departments_org_idx").on(table.organizationId),
  unique("departments_org_name_unique").on(table.organizationId, table.name),
  index("departments_fts_idx").using("gin", sql`coznt.fts_vector(${table.name}, ${table.description})`),
]);

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;

// -- Org Identity ------------------------------------------------------

export interface UploadedDocument {
  id: string;
  filename: string;
  url: string;
  content?: string;
  uploadedAt: string;
}

export interface ExtractedIdentity {
  values?: string[];
  culturalSignals?: string[];
  hiringPrinciples?: string[];
  behavioralExpectations?: string[];
  redFlags?: string[];
  summary?: string;
  [key: string]: unknown;
}

export const orgIdentity = cozntSchema.table("org_identities", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  rawText: text("raw_text"),
  uploadedDocuments: jsonb("uploaded_documents").$type<UploadedDocument[]>(),
  extractedIdentity: jsonb("extracted_identity").$type<ExtractedIdentity>(),
  extractedAt: timestamp("extracted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("org_identities_org_unique").on(table.organizationId),
]);

export type OrgIdentity = typeof orgIdentity.$inferSelect;
export type NewOrgIdentity = typeof orgIdentity.$inferInsert;
