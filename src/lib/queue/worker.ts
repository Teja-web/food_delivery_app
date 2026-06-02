/**
 * Worker Poll Loop
 *
 * Single queue, concurrent message processing via Promise.allSettled.
 * Retry via visibility timeout — failed messages are NOT archived.
 */

import { createQueue, read, archive } from "@/lib/queue/client";
import type { PgmqMessage } from "@/lib/queue/client";
import type { Logger } from "@/lib/logger";
import type { JobErrorInfo } from "@/lib/queue/error-notifier";

export interface WorkerConfig {
  /** Queue name to poll */
  queue: string;
  /** Process a single message. Throw to trigger retry via VT. */
  handler: (message: unknown) => Promise<void>;
  /** Called when a job fails (before VT retry) */
  onError?: (info: JobErrorInfo) => Promise<void>;
  /** Messages per poll (also caps concurrency) */
  batchSize?: number;
  /** Milliseconds between polls when idle */
  pollIntervalMs?: number;
  /** Seconds before unacknowledged message becomes visible again */
  visibilityTimeoutS?: number;
  logger?: Logger;
}

export async function startWorker(config: WorkerConfig): Promise<void> {
  const {
    queue,
    handler,
    onError,
    batchSize = 5,
    pollIntervalMs = 1000,
    visibilityTimeoutS = 60,
    logger: log,
  } = config;

  // Ensure queue exists
  await createQueue(queue);
  log?.info("Queue ready", { queue });

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log?.info("Shutting down...");
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  log?.info(`Polling ${queue} every ${pollIntervalMs}ms (batch=${batchSize})`);

  while (!shuttingDown) {
    try {
      const messages = await read<unknown>(queue, visibilityTimeoutS, batchSize);

      if (messages.length > 0) {
        await Promise.allSettled(
          messages.map((msg) => processMessage(queue, msg, handler, onError, log)),
        );
      } else {
        await sleep(pollIntervalMs);
      }
    } catch (error) {
      log?.error("Poll error", error);
      await sleep(pollIntervalMs * 5);
    }
  }
}

async function processMessage(
  queue: string,
  msg: PgmqMessage<unknown>,
  handler: (message: unknown) => Promise<void>,
  onError?: (info: JobErrorInfo) => Promise<void>,
  log?: Logger,
): Promise<void> {
  try {
    await handler(msg.message);
    await archive(queue, msg.msg_id);
  } catch (error) {
    // Properly serialize error - AI SDK throws non-standard error objects
    let errMessage: string;
    if (error instanceof Error) {
      errMessage = error.message;
    } else if (error && typeof error === "object") {
      errMessage = JSON.stringify(error, null, 2);
    } else {
      errMessage = String(error);
    }
    const err = error instanceof Error ? error : new Error(errMessage);
    log?.error("Job failed", { msgId: msg.msg_id, error: errMessage });

    if (onError) {
      await onError({ queue, msgId: msg.msg_id, message: msg.message, error: err });
    }

    // Message becomes visible again after VT expires (retry)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
