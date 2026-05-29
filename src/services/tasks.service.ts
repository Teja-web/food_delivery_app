import { and, eq } from "drizzle-orm";
import { db, initializeDatabase } from "../db";
import { tasks, type Task } from "../db/schema/tasks";
import type { CreateTaskInput, PatchTaskInput } from "../validation/task.schemas";

export type TaskResponse = {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

function toDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function serializeTask(task: Task): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export async function createTask(input: CreateTaskInput) {
  await initializeDatabase();
  const [created] = await db
    .insert(tasks)
    .values({
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "todo",
      priority: input.priority ?? "medium",
      dueDate: toDate(input.dueDate),
    })
    .returning();

  return serializeTask(created);
}

export async function listTasks(status?: Task["status"]) {
  await initializeDatabase();
  const rows = status
    ? await db.select().from(tasks).where(eq(tasks.status, status))
    : await db.select().from(tasks);

  return rows.map(serializeTask);
}

export async function getTask(id: string) {
  await initializeDatabase();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return task ? serializeTask(task) : null;
}

export async function patchTask(id: string, input: PatchTaskInput) {
  await initializeDatabase();
  const updates: Partial<typeof tasks.$inferInsert> = {
    updatedAt: new Date(),
  };

  if ("title" in input) updates.title = input.title;
  if ("description" in input) updates.description = input.description ?? null;
  if ("status" in input) updates.status = input.status;
  if ("priority" in input) updates.priority = input.priority;
  if ("dueDate" in input) updates.dueDate = toDate(input.dueDate);

  const [updated] = await db
    .update(tasks)
    .set(updates)
    .where(eq(tasks.id, id))
    .returning();

  return updated ? serializeTask(updated) : null;
}

export async function deleteTask(id: string) {
  await initializeDatabase();
  const deleted = await db
    .delete(tasks)
    .where(and(eq(tasks.id, id)))
    .returning({ id: tasks.id });

  return deleted.length > 0;
}
