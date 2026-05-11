import { text, integer, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";

// -- Enums -------------------------------------------------------------

export const CANDIDATE_STATUSES = ["active", "inactive"] as const;
export const ORG_CANDIDATE_STATUSES = ["active", "talent_pool", "do_not_hire", "archived", "alumni"] as const;

/**
 * Candidate kind — discriminator for matching + dashboard variant.
 *  - "professional":  default; experienced candidate (resume + history)
 *  - "student":       in school, looking for internship / new-grad
 *  - "early_career":  graduated within ~18 months, hybrid student/professional
 *
 * (candidate-portal-plan Phase 3; docs/phase-3-campus-spec.md.)
 */
export const CANDIDATE_KINDS = ["professional", "student", "early_career"] as const;
export type CandidateKind = (typeof CANDIDATE_KINDS)[number];

export const candidateStatusEnum = dillizntSchema.enum("candidate_status", CANDIDATE_STATUSES);
export const orgCandidateStatusEnum = dillizntSchema.enum("org_candidate_status", ORG_CANDIDATE_STATUSES);

// -- Candidates --------------------------------------------------------

export interface CandidateExperience {
  title: string;
  company: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface CandidateEducation {
  institution: string;
  degree: string;
  field?: string;
  year?: number;
}

export interface CandidateProfile {
  summary: string;
  totalYearsExperience?: number;
  languages?: string[];
  certifications?: string[];
}

export const candidates = dillizntSchema.table("candidates", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  // Creator stamp only — NOT used for visibility scoping. NULL = portal-only
  // person not yet adopted by any org. Visibility is driven by org_candidates.
  organizationId: text("organization_id"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  title: text("title"),
  company: text("company"),
  location: text("location"),
  source: text("source"),
  resumeUrl: text("resume_url"),
  resumeText: text("resume_text"),
  tags: text("tags").array(),
  skills: jsonb("skills").$type<string[]>(),
  experience: jsonb("experience").$type<CandidateExperience[]>(),
  education: jsonb("education").$type<CandidateEducation[]>(),
  profile: jsonb("profile").$type<CandidateProfile>(),
  talentScore: integer("talent_score"),
  about: text("about"),
  /** Discriminator — see CANDIDATE_KINDS. Mutable; set at sign-up. */
  kind: text("kind").$type<CandidateKind>().notNull().default("professional"),
  status: candidateStatusEnum("status").notNull().default("active"),
  actorType: text("actor_type"),
  actorId: text("actor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
}, (table) => [
  index("recruit_candidates_org_idx").on(table.organizationId),
  unique("recruit_candidates_email_uniq").on(table.email),
  index("recruit_candidates_fts_idx").using("gin", sql`dilliznt.fts_vector(${table.name}, ${table.email}, ${table.location}, ${table.title}, ${table.company}, ${table.resumeText})`),
]);

export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;

// -- Org Candidates ----------------------------------------------------

export const orgCandidates = dillizntSchema.table("org_candidates", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at").defaultNow().notNull(),
  addedById: text("added_by_id"),
  addedByName: text("added_by_name"),
  // Vendor org id (auth.organization). NULL = internal add or backfilled row.
  // Load-bearing for vendor scoping in Phase 3.
  addedByOrgId: text("added_by_org_id"),
  // Channel by which this person entered THIS org's pool (linkedin, naukri,
  // vendor, referral, inbound). Distinct from candidates.source which captures
  // the person's original origin.
  source: text("source"),
  status: orgCandidateStatusEnum("status").notNull().default("active"),
}, (table) => [
  index("recruit_org_candidates_org_idx").on(table.organizationId),
  index("recruit_org_candidates_candidate_idx").on(table.candidateId),
  index("recruit_org_candidates_org_vendor_idx").on(table.organizationId, table.addedByOrgId),
  unique("recruit_org_candidates_uniq").on(table.organizationId, table.candidateId),
]);

export type OrgCandidate = typeof orgCandidates.$inferSelect;
export type NewOrgCandidate = typeof orgCandidates.$inferInsert;
