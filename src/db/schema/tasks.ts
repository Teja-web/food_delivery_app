import {
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const taskStatus = pgEnum("task_status", [
  "todo",
  "in_progress",
  "done",
]);

export const taskPriority = pgEnum("task_priority", [
  "low",
  "med",
  "high",
]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatus("status").notNull().default("todo"),
    priority: taskPriority("priority").notNull().default("med"),
    dueDate: date("due_date", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusDueDateIdx: index("tasks_status_due_date_idx").on(
      table.status,
      table.dueDate,
    ),
  }),
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
