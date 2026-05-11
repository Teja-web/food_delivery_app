/**
 * Entity Notes — user-created notes attached to any entity.
 *
 * Generic notes table. Valid `entityType` values:
 *   - "role"        — note on a role (visible across all that role's surfaces)
 *   - "candidate"   — global to the candidate (visible on every role they're in)
 *   - "application" — scoped to a specific (role, candidate) pairing; does NOT
 *                     bleed across other roles the candidate appears in
 *   - "interview"   — scoped to a single interview
 *   - "pool"        — pool-level note
 *
 * The `application` vs `candidate` distinction matters: application notes
 * stay private to the role's pipeline; candidate notes travel with the
 * person across every role.
 *
 * Displayed inline within the activity timeline.
 */

import { text, timestamp, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";

/** Valid entity types for entity_notes.entity_type. Keep in sync with the JSDoc above. */
export const ENTITY_NOTE_TYPES = ["role", "candidate", "application", "interview", "pool"] as const;
export type EntityNoteType = (typeof ENTITY_NOTE_TYPES)[number];

export const entityNotes = cozntSchema.table("entity_notes", {
  id: text().primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),

  // What this note is attached to. See ENTITY_NOTE_TYPES for valid values.
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),

  // Content
  body: text().notNull(),

  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
}, (table) => [
  index("recruit_entity_notes_entity_idx").on(table.entityType, table.entityId, table.createdAt),
  index("recruit_entity_notes_org_idx").on(table.organizationId),
]);

export type EntityNote = typeof entityNotes.$inferSelect;
export type NewEntityNote = typeof entityNotes.$inferInsert;
