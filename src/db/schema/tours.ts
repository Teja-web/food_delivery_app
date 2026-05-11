import { text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { dillizntSchema } from "./schema";

export const tourProgress = dillizntSchema.table(
  "tour_progress",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    tourId: text("tour_id").notNull(),
    status: text().$type<"pending" | "completed" | "skipped">().notNull().default("pending"),
    currentStep: integer("current_step"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("tour_progress_user_idx").on(t.userId, t.organizationId),
    index("tour_progress_tour_idx").on(t.tourId, t.userId),
  ],
);
