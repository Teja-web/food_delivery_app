/**
 * Organization and project artifacts -- passive, authoritative files.
 *
 * Org artifacts are uploaded once at the organization scope. Project artifacts
 * are snapshots copied into a project when a user selects them, plus
 * project-only uploads. Agents read project artifacts, not dynamic org
 * inheritance.
 */

import { index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { organization } from "./auth";
import { projects } from "./project";
import { cozntSchema } from "./schema";

export const REQUIRED_ORGANIZATION_ARTIFACT_KEYS = [
  "coding_standards",
  "brand_guidelines",
  "architecture_principles",
] as const;
export type RequiredOrganizationArtifactKey =
  (typeof REQUIRED_ORGANIZATION_ARTIFACT_KEYS)[number];

export const ORGANIZATION_ARTIFACT_LABELS: Record<RequiredOrganizationArtifactKey, string> = {
  coding_standards: "Coding Standards",
  brand_guidelines: "Brand Guidelines",
  architecture_principles: "Architecture Principles",
};

export const ORGANIZATION_ARTIFACT_UPLOAD_FIELDS: Record<
  RequiredOrganizationArtifactKey,
  string
> = {
  coding_standards: "codingStandardsBody",
  brand_guidelines: "brandGuidelinesBody",
  architecture_principles: "architecturePrinciplesBody",
};

export const REQUIRED_ORGANIZATION_ARTIFACT_FILE_NAMES: Record<
  RequiredOrganizationArtifactKey,
  string
> = {
  brand_guidelines: "brand_guidelines.md",
  architecture_principles: "architecture.md",
  coding_standards: "coding_instructions.md",
};

export const ARTIFACT_FILE_TYPES = [".md", ".txt", ".html", ".json"] as const;
export type ArtifactFileType = (typeof ARTIFACT_FILE_TYPES)[number];

export const PROJECT_ARTIFACT_CREATED_VIA = ["MCP", "upload"] as const;
export type ProjectArtifactCreatedVia = (typeof PROJECT_ARTIFACT_CREATED_VIA)[number];

export const PROJECT_ARTIFACT_STATUSES = ["pending", "approved", "rejected"] as const;
export type ProjectArtifactStatus = (typeof PROJECT_ARTIFACT_STATUSES)[number];

export const PROJECT_ARTIFACT_KINDS = ["requirements", "design", "custom"] as const;
export type ProjectArtifactKind = (typeof PROJECT_ARTIFACT_KINDS)[number];

export interface ArtifactMetadata {
  requiredKey?: RequiredOrganizationArtifactKey;
  projectArtifactKind?: ProjectArtifactKind;
  title?: string;
  contentHash?: string;
  sourceOrganizationArtifactId?: string;
  [key: string]: unknown;
}

export const organizationArtifacts = cozntSchema.table(
  "organization_artifacts",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text().notNull(),
    body: text().notNull(),
    summary: text(),
    type: text().$type<ArtifactFileType>().notNull(),
    category: text(),
    metadata: jsonb().$type<ArtifactMetadata>().notNull().default(sql`'{}'::jsonb`),
    creatorId: text("creator_id"),
    creatorName: text("creator_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("organization_artifacts_org_idx").on(table.organizationId),
    index("organization_artifacts_type_idx").on(table.type),
    index("organization_artifacts_category_idx").on(table.organizationId, table.category),
    index("organization_artifacts_fts_idx").using(
      "gin",
      sql`coznt.fts_vector(${table.name}, ${table.body})`,
    ),
  ],
);

export const projectArtifacts = cozntSchema.table(
  "project_artifacts",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text().notNull(),
    body: text().notNull(),
    summary: text(),
    type: text().$type<ArtifactFileType>().notNull(),
    category: text(),
    createdVia: text("created_via").$type<ProjectArtifactCreatedVia>().notNull(),
    status: text().$type<ProjectArtifactStatus>().notNull().default("approved"),
    metadata: jsonb().$type<ArtifactMetadata>().notNull().default(sql`'{}'::jsonb`),
    creatorId: text("creator_id"),
    creatorName: text("creator_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("project_artifacts_org_idx").on(table.organizationId),
    index("project_artifacts_project_idx").on(table.projectId),
    index("project_artifacts_status_idx").on(table.organizationId, table.projectId, table.status),
    index("project_artifacts_type_idx").on(table.type),
    index("project_artifacts_category_idx").on(table.organizationId, table.projectId, table.category),
    index("project_artifacts_fts_idx").using(
      "gin",
      sql`coznt.fts_vector(${table.name}, ${table.body})`,
    ),
  ],
);

export type OrganizationArtifact = typeof organizationArtifacts.$inferSelect;
export type NewOrganizationArtifact = typeof organizationArtifacts.$inferInsert;
export type ProjectArtifact = typeof projectArtifacts.$inferSelect;
export type NewProjectArtifact = typeof projectArtifacts.$inferInsert;
