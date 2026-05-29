import { db, initializeDatabase } from "../../src/db";
import { tasks } from "../../src/db/schema/tasks";

export async function resetTasks() {
  await initializeDatabase();
  await db.delete(tasks);
}
