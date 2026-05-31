import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema/tasks";

const client = new PGlite();
export const pgClient = client;

export const db = drizzle(client, { schema });

let initialized: Promise<void> | undefined;

export function initializeDatabase() {
  initialized ??= client.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
        CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
        CREATE TYPE task_priority AS ENUM ('low', 'med', 'high');
      END IF;
    END
    $$;

    CREATE TABLE IF NOT EXISTS tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text,
      status task_status NOT NULL DEFAULT 'todo',
      priority task_priority NOT NULL DEFAULT 'med',
      due_date date NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS tasks_status_due_date_idx
      ON tasks (status, due_date);
  `).then(() => undefined);

  return initialized;
}

export async function resetDatabase() {
  await initializeDatabase();
  await db.delete(schema.tasks);
}
