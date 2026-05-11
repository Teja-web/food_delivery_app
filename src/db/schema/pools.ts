import { text, timestamp, jsonb, integer, index, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";
import { candidates } from "./candidates";

// -- Pools -��----------------------------------��------------------------

export interface PoolCriteria {
  skills: string[];
  locations: string[];
  experienceMin?: number | null;
  experienceMax?: number | null;
  tags?: string[];
}

export const pools = dillizntSchema.table("pools", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  criteria: jsonb("criteria").$type<PoolCriteria>(),
  health: text("health").default("active"),
  candidateCount: integer("candidate_count").default(0),
  matchingRoleIds: jsonb("matching_role_ids").$type<string[]>().default([]),
  topSignal: text("top_signal"),
  lastUpdated: timestamp("last_updated"),
  actorType: text("actor_type"),
  actorId: text("actor_id"),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("recruit_pools_org_idx").on(table.organizationId),
  index("recruit_pools_fts_idx").using("gin", sql`dilliznt.fts_vector(${table.name}, ${table.description})`),
]);

export type Pool = typeof pools.$inferSelect;
export type NewPool = typeof pools.$inferInsert;

// -- Pool Members ------------------------------------------------------

export const poolMembers = dillizntSchema.table("pool_members", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  poolId: text("pool_id").notNull().references(() => pools.id, { onDelete: "cascade" }),
  candidateId: text("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  addedBy: text("added_by"),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("recruit_pool_members_pool_idx").on(table.poolId),
  index("recruit_pool_members_candidate_idx").on(table.candidateId),
  unique("recruit_pool_members_uniq").on(table.poolId, table.candidateId),
]);

export type PoolMember = typeof poolMembers.$inferSelect;
export type NewPoolMember = typeof poolMembers.$inferInsert;
