import { and, eq } from "drizzle-orm";
import { db, initializeDatabase } from "../db";
import { tasks, type Task } from "../db/schema/tasks";
import type { CreateTaskInput, PatchTaskInput } from "../validation/task.schemas";

export type TaskResponse = {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "med" | "high";
  dueDate: string;
  createdAt: string;
  updatedAt: string;
};

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function serializeTask(task: Task): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: toDateString(task.dueDate),
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
      priority: input.priority ?? "med",
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
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!existing) return null;

  const updates: Partial<typeof tasks.$inferInsert> = {
  };
  let changed = false;

  function setIfChanged<TKey extends keyof typeof updates>(
    key: TKey,
    current: (typeof tasks.$inferSelect)[TKey],
    next: (typeof updates)[TKey],
  ) {
    if (current !== next) {
      updates[key] = next;
      changed = true;
    }
  }

  if ("title" in input) setIfChanged("title", existing.title, input.title);
  if ("description" in input) {
    setIfChanged("description", existing.description, input.description ?? null);
  }
  if ("status" in input) setIfChanged("status", existing.status, input.status);
  if ("priority" in input) setIfChanged("priority", existing.priority, input.priority);
  if ("dueDate" in input && input.dueDate !== undefined) {
    const currentDueDate = toDateString(existing.dueDate);
    if (currentDueDate !== input.dueDate) {
      updates.dueDate = toDate(input.dueDate);
      changed = true;
    }
  }

  if (!changed) return serializeTask(existing);
  updates.updatedAt = new Date();

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
