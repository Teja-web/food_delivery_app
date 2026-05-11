/**
 * Recruit Worker — thin entrypoint.
 *
 * Configures app-specific concerns (event listeners, error notifier),
 * then starts the shared poll loop with a message handler.
 */

import "dotenv/config";
import { nanoid } from "nanoid";
import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { startWorker } from "../src/lib/worker";
import { matchRules, type CrudEvent } from "../src/lib/rules";
import { buildScopedContext, runWithContext } from "../src/lib/auth/context";
import { setEmbeddingProvider } from "../src/lib/embedding";
import { createJobErrorNotifier } from "../src/lib/error-notifier";
import { startEventListener } from "../src/lib/events/listener";
import { createLogger } from "../src/lib/logger";

const APP_ID = "recruit";
const QUEUE_NAME = "recruit_events";
const log = createLogger(`${APP_ID}:worker`);

async function handleMessage(raw: unknown): Promise<void> {
  const event = raw as CrudEvent;
  const traceId = nanoid();

  const matched = matchRules(event);
  if (matched.length === 0) return;

  log.info(`Event: ${event.entityType}.${event.operation} id=${event.entityId} trace=${traceId}`);

  const ctx = buildScopedContext(
    event.organizationId,
    { id: event.userId || "system", name: event.userName || "System" },
  );

  for (const rule of matched) {
    log.info(`Rule: ${rule.id} (${rule.tasks.length} tasks)`, { traceId, entityId: event.entityId });

    for (const task of rule.tasks) {
      await runWithContext(ctx, () =>
        task({
          organizationId: event.organizationId,
          entityId: event.entityId,
          entityType: event.entityType,
          operation: event.operation,
          traceId,
          data: event.newData,
        }),
      );
    }
  }
}

async function main() {
  log.info("Starting...");

  // 1. Configure embedding provider
  const modelName = "text-embedding-3-small";
  setEmbeddingProvider({
    async embed(text: string): Promise<number[]> {
      const { embedding } = await embed({
        model: openai.embedding(modelName),
        value: text.toLowerCase().trim().slice(0, 8000),
      });
      return embedding;
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const batchSize = 100;
      const results: number[][] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const { embeddings } = await embedMany({
          model: openai.embedding(modelName),
          values: batch.map((t) => t.toLowerCase().trim().slice(0, 8000)),
        });
        results.push(...embeddings);
      }
      return results;
    },
  });
  log.info("Embedding provider configured");

  // 2. Start event listeners (PG LISTEN → EventBus → SSE)
  await startEventListener();
  log.info("Event listener started");

  // 3. Start poll loop
  await startWorker({
    queue: QUEUE_NAME,
    handler: handleMessage,
    onError: createJobErrorNotifier({
      appId: APP_ID,
      queueLabels: { [QUEUE_NAME]: "Automation dispatch" },
    }),
    batchSize: parseInt(process.env.WORKER_BATCH_SIZE || "5", 10),
    pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || "1000", 10),
    logger: log,
  });
}

main().catch((err) => {
  log.error("Fatal error", err);
  process.exit(1);
});
