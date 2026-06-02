/**
 * Job Error Notifier
 *
 * Creates an onJobError callback that logs structured error info
 * when background jobs fail. Extracts context from message payload.
 * Publishes to EventBus so SSE-connected clients receive real-time alerts.
 */

import { createLogger } from "../logger";
import { eventBus } from "../events/bus";

const log = createLogger("job-error");

export interface JobErrorInfo {
  queue: string;
  msgId: string;
  message: unknown;
  error: Error;
}

export interface JobErrorNotifierConfig {
  appId: string;
  /** Map queue names to human-readable labels */
  queueLabels?: Record<string, string>;
}

export function createJobErrorNotifier(config: JobErrorNotifierConfig) {
  const { appId, queueLabels = {} } = config;

  function getQueueLabel(queue: string): string {
    if (queueLabels[queue]) return queueLabels[queue];
    if (queue.startsWith(`${appId}:`)) {
      const raw = queue.slice(appId.length + 1).replace(/^wf_/, "").replace(/_/g, " ");
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    return queue.replace(/_/g, " ");
  }

  return async function onJobError({ queue, msgId, message, error }: JobErrorInfo): Promise<void> {
    const payload = message as Record<string, unknown> | null;
    const organizationId = payload?.organizationId as string | undefined;
    const entityType = payload?.entityType as string | undefined;
    const entityId = payload?.entityId as string | undefined;

    // Properly serialize error - may be non-standard error object
    const errorMessage = error instanceof Error
      ? error.message
      : (typeof error === "object" ? JSON.stringify(error) : String(error));

    log.error(`${getQueueLabel(queue)} failed`, {
      queue,
      msgId,
      organizationId,
      entityType,
      entityId,
      error: errorMessage,
    } as unknown as Error);

    if (organizationId) {
      eventBus.publish({
        type: "job.error",
        payload: {
          entityType: entityType ?? "unknown",
          entityId: entityId ?? "",
          organizationId,
          operation: "error",
        },
        timestamp: new Date().toISOString(),
      });
    }
  };
}
