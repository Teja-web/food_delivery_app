/**
 * Comment — threaded review discussion on a plan.
 */

import { text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { plans } from "./plan";

export const comments = cozntSchema.table(
  "comments",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
    parentCommentId: text("parent_comment_id"),

    authorId: text("author_id").notNull(),
    authorName: text("author_name"),
    body: text().notNull(),
    resolved: boolean().notNull().default(false),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("comments_plan_idx").on(table.planId, table.createdAt),
    index("comments_org_idx").on(table.organizationId),
    index("comments_fts_idx").using("gin", sql`coznt.fts_vector(${table.body})`),
  ],
);

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
