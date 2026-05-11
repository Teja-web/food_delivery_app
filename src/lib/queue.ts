/**
 * pgmq Client
 *
 * Typed access to pgmq queues for background job processing.
 * Used by both worker (read/archive) and app code (send).
 */

import { db } from "@/db/client";
import { sql } from "drizzle-orm";

export interface PgmqMessage<T> {
  msg_id: string;
  read_ct: number;
  enqueued_at: Date;
  vt: Date;
  message: T;
}

/**
 * Ensure a queue exists (idempotent).
 */
export async function createQueue(queue: string): Promise<void> {
  await db.execute(sql`
    SELECT pgmq.create_non_partitioned(${queue}::text)
  `).catch(() => {
    // Queue may already exist
  });
}

/**
 * Send a message to a queue.
 */
export async function send<T>(
  queue: string,
  message: T,
  delaySeconds = 0,
): Promise<string> {
  const result = await db.execute(sql`
    SELECT pgmq.send(
      ${queue}::text,
      ${JSON.stringify(message)}::jsonb,
      ${delaySeconds}::integer
    ) as msg_id
  `);
  return (result.rows[0] as any).msg_id;
}

/**
 * Read messages from a queue with visibility timeout.
 * Messages become invisible to other readers for vtSeconds.
 */
export async function read<T>(
  queue: string,
  vtSeconds = 30,
  limit = 1,
): Promise<PgmqMessage<T>[]> {
  const result = await db.execute(sql`
    SELECT * FROM pgmq.read(
      ${queue}::text,
      ${vtSeconds}::integer,
      ${limit}::integer
    )
  `);

  return result.rows.map((row: any) => ({
    msg_id: row.msg_id.toString(),
    read_ct: row.read_ct,
    enqueued_at: row.enqueued_at,
    vt: row.vt,
    message: row.message as T,
  }));
}

/**
 * Archive a message after successful processing.
 */
export async function archive(queue: string, msgId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT pgmq.archive(${queue}::text, ${msgId}::bigint) as archived
  `);
  return (result.rows[0] as any)?.archived ?? false;
}

/**
 * Extend visibility timeout for a message (if processing takes longer).
 */
export async function setVt(
  queue: string,
  msgId: string,
  vtSeconds: number,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT pgmq.set_vt(${queue}::text, ${msgId}::bigint, ${vtSeconds}::integer) as msg_id
  `);
  return (result.rows[0] as any)?.msg_id != null;
}

/**
 * Get queue metrics (length, age, total).
 */
export async function metrics(queue: string): Promise<{
  queue_length: number;
  newest_msg_age_sec: number | null;
  oldest_msg_age_sec: number | null;
  total_messages: number;
}> {
  const result = await db.execute(sql`
    SELECT * FROM pgmq.metrics(${queue}::text)
  `);
  const row = result.rows[0] as any;
  return {
    queue_length: row?.queue_length ?? 0,
    newest_msg_age_sec: row?.newest_msg_age_sec,
    oldest_msg_age_sec: row?.oldest_msg_age_sec,
    total_messages: row?.total_messages ?? 0,
  };
}
