import { text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";

export interface RoleCriteriaConfig {
  criteria: Array<{
    category: string;
    name: string;
    description: string;
    weight: "critical" | "important" | "nice_to_have";
  }>;
  keywords: Array<{
    term: string;
    category: "skill" | "experience" | "qualification" | "trait";
    importance: "critical" | "important" | "nice_to_have";
  }>;
}

export interface RoleCompensation {
  min: number;
  max: number;
  currency?: string;
  equity?: string;
  bonus?: string;
}

/**
 * Vendor visibility on a role:
 *   - "internal":  no vendors (default; preserves prior behavior)
 *   - "all":       every active partnered vendor
 *   - "exclusive": only the vendor named in `exclusiveVendorOrgId`
 *
 * (vendor-and-attribution-plan.md Phase 3.)
 */
export const VENDOR_VISIBILITY = ["internal", "all", "exclusive"] as const;
export type VendorVisibility = typeof VENDOR_VISIBILITY[number];

/**
 * Public visibility on a role:
 *   - "private":    never appears on /opportunities (default)
 *   - "anonymized": listed with bucketed labels; org name redacted, comp banded
 *   - "public":     listed with full org name and exact comp
 *
 * (candidate-portal-plan Phase 2; docs/phase-2-public-funnel-spec.md.)
 */
export const PUBLIC_VISIBILITY = ["private", "anonymized", "public"] as const;
export type PublicVisibility = typeof PUBLIC_VISIBILITY[number];

/**
 * Role kind — drives matcher selection and student vs professional surfaces.
 *  - "full_time":     default; lateral hire
 *  - "internship":    student-shaped role
 *  - "new_grad":      first-out-of-school role
 *  - "apprenticeship":structured early-career program
 *  - "contract":      fixed-term engagement
 *
 * Distinct from `employmentType` (free-text legacy field). The two coexist;
 * `kind` is the strictly-typed discriminator the matcher reads.
 *
 * (candidate-portal-plan Phase 3; docs/phase-3-campus-spec.md.)
 */
export const ROLE_KINDS = [
  "full_time",
  "internship",
  "new_grad",
  "apprenticeship",
  "contract",
] as const;
export type RoleKind = (typeof ROLE_KINDS)[number];

export const roles = dillizntSchema.table("roles", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  title: text("title").notNull(),
  team: text("team"),
  department: text("department"),
  hiringManagerId: text("hiring_manager_id"),
  recruiterId: text("recruiter_id"),
  location: text("location"),
  headcount: integer("headcount").default(1),
  compensation: jsonb("compensation").$type<RoleCompensation>(),
  description: text("description"),
  businessCase: text("business_case"),
  criteriaConfig: jsonb("criteria_config").$type<RoleCriteriaConfig>(),
  employmentType: text("employment_type"),
  /** Discriminator — see ROLE_KINDS. */
  kind: text("kind").$type<RoleKind>().notNull().default("full_time"),
  status: text("status").notNull().default("draft"),
  /** Per-role vendor visibility setting (see VENDOR_VISIBILITY). */
  vendorVisibility: text("vendor_visibility").notNull().default("internal"),
  /** When vendorVisibility = "exclusive", the single vendor org id allowed. */
  exclusiveVendorOrgId: text("exclusive_vendor_org_id"),
  /** Per-role public visibility setting (see PUBLIC_VISIBILITY). */
  publicVisibility: text("public_visibility").notNull().default("private"),
  /**
   * HMAC-derived slug used in /opportunities/[slug] URLs. Stable across
   * visibility changes. NULL until the first non-private save (cheap to
   * generate; just lazy to keep migrations clean).
   */
  publicSlug: text("public_slug").unique(),
  health: text("health").default("new"),
  outcome: text("outcome"),
  closedDate: timestamp("closed_date"),
  talentScore: integer("talent_score"),
  targetHireDate: timestamp("target_hire_date"),
  actorType: text("actor_type"),
  actorId: text("actor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
}, (table) => [
  index("recruit_roles_org_idx").on(table.organizationId),
  index("recruit_roles_status_idx").on(table.status),
  index("recruit_roles_fts_idx").using("gin", sql`dilliznt.fts_vector(${table.title}, ${table.team}, ${table.department}, ${table.location}, ${table.description}, ${table.businessCase})`),
]);

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
