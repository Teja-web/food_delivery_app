/**
 * Standards -- passive, authoritative org/project documents.
 *
 * Standards are not skills. Skills are executable workflows; standards are
 * reference material that agents must consult exactly as authored. A null
 * `projectId` means org-wide default. A project row with the same required
 * `kind`, or the same custom `slug`, overrides the org row for that project.
 */

import { boolean, index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { projects } from "./project";
import { cozntSchema } from "./schema";

export const STANDARD_KINDS = [
  "coding_standards",
  "brand_guidelines",
  "architecture_principles",
  "custom",
] as const;
export type StandardKind = (typeof STANDARD_KINDS)[number];

export const REQUIRED_STANDARD_KINDS = [
  "coding_standards",
  "brand_guidelines",
  "architecture_principles",
] as const;
export type RequiredStandardKind = (typeof REQUIRED_STANDARD_KINDS)[number];

export const STANDARD_FORMATS = ["markdown", "text"] as const;
export type StandardFormat = (typeof STANDARD_FORMATS)[number];

export const STANDARD_KIND_LABELS: Record<RequiredStandardKind, string> = {
  coding_standards: "Coding Standards",
  brand_guidelines: "Brand Guidelines",
  architecture_principles: "Architecture Principles",
};

export const STANDARD_UPLOAD_FIELDS: Record<RequiredStandardKind, string> = {
  coding_standards: "codingStandardsBody",
  brand_guidelines: "brandGuidelinesBody",
  architecture_principles: "architecturePrinciplesBody",
};

export const standards = cozntSchema.table(
  "standards",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    /** null = org-wide default; project rows override inherited defaults. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),

    kind: text().$type<StandardKind>().notNull(),
    slug: text().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    format: text().$type<StandardFormat>().notNull().default("markdown"),
    version: text().notNull().default("1.0.0"),
    contentHash: text("content_hash").notNull(),
    sourceFileName: text("source_file_name"),

    enabled: boolean().notNull().default(true),
    deletedAt: timestamp("deleted_at"),

    createdById: text("created_by_id"),
    createdByName: text("created_by_name"),
    updatedById: text("updated_by_id"),
    updatedByName: text("updated_by_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("standards_org_idx").on(table.organizationId),
    index("standards_project_idx").on(table.projectId),
    index("standards_kind_idx").on(table.kind),
    index("standards_slug_idx").on(table.organizationId, table.slug),
    index("standards_hash_idx").on(table.contentHash),
    index("standards_fts_idx").using(
      "gin",
      sql`coznt.fts_vector(${table.title}, ${table.body})`,
    ),

    uniqueIndex("standards_org_required_active_uniq")
      .on(table.organizationId, table.kind)
      .where(sql`${table.projectId} is null and ${table.kind} <> 'custom' and ${table.enabled} = true and ${table.deletedAt} is null`),
    uniqueIndex("standards_project_required_active_uniq")
      .on(table.organizationId, table.projectId, table.kind)
      .where(sql`${table.projectId} is not null and ${table.kind} <> 'custom' and ${table.enabled} = true and ${table.deletedAt} is null`),
    uniqueIndex("standards_org_custom_active_uniq")
      .on(table.organizationId, table.slug)
      .where(sql`${table.projectId} is null and ${table.kind} = 'custom' and ${table.enabled} = true and ${table.deletedAt} is null`),
    uniqueIndex("standards_project_custom_active_uniq")
      .on(table.organizationId, table.projectId, table.slug)
      .where(sql`${table.projectId} is not null and ${table.kind} = 'custom' and ${table.enabled} = true and ${table.deletedAt} is null`),
  ],
);

export type Standard = typeof standards.$inferSelect;
export type NewStandard = typeof standards.$inferInsert;
