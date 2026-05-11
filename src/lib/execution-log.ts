/**
 * Execution Logger — writes audit entries to dilliznt.automation_log.
 *
 * Every task execution should call `logExecution()` after completing its work.
 * The run reference (outputTable + outputId) ties the log entry to the
 * structured intelligence record it produced.
 */

import { nanoid } from "nanoid";
import { automationLog } from "@/db/schema";

interface LogExecutionParams {
  db: any;
  taskId: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  status: "completed" | "failed";
  traceId?: string;
  errorMessage?: string;
  durationMs?: number;
  actorType?: string;
  actorId?: string;
  outputTable?: string;
  outputId?: string;
  outputAction?: "created" | "updated";
}

/**
 * Log a task execution to automation_log with optional run references.
 * Returns the log entry ID so callers can set lastRunId on intelligence records.
 */
export async function logExecution(params: LogExecutionParams): Promise<string> {
  const id = nanoid();
  const now = new Date();

  await params.db.insert(automationLog).values({
    id,
    organizationId: params.organizationId,
    entityType: params.entityType,
    entityId: params.entityId,
    taskId: params.taskId,
    traceId: params.traceId ?? null,
    status: params.status,
    errorMessage: params.errorMessage ?? null,
    durationMs: params.durationMs ?? null,
    actorType: params.actorType ?? "agent",
    actorId: params.actorId ?? null,
    outputTable: params.outputTable ?? null,
    outputId: params.outputId ?? null,
    outputAction: params.outputAction ?? null,
    createdAt: now,
    completedAt: params.status === "completed" ? now : null,
  });

  return id;
}

/**
 * Wraps a task function with automatic execution logging.
 *
 * Usage:
 *   const result = await withExecutionLog(db, {
 *     taskId: "candidate-intake",
 *     organizationId, entityType: "candidate", entityId, traceId,
 *   }, async (log) => {
 *     // ... do work ...
 *     log.setOutput("candidate_intelligence", intelId, "created");
 *     return result;
 *   });
 */
export async function withExecutionLog<T>(
  db: any,
  params: Omit<LogExecutionParams, "db" | "status" | "durationMs" | "errorMessage" | "outputTable" | "outputId" | "outputAction">,
  fn: (log: ExecutionLogHandle) => Promise<T>,
): Promise<T> {
  const start = Date.now();
  const handle = new ExecutionLogHandle();

  try {
    const result = await fn(handle);
    const runId = await logExecution({
      db,
      ...params,
      status: "completed",
      durationMs: Date.now() - start,
      outputTable: handle._outputTable,
      outputId: handle._outputId,
      outputAction: handle._outputAction,
    });
    handle._runId = runId;
    return result;
  } catch (error) {
    await logExecution({
      db,
      ...params,
      status: "failed",
      durationMs: Date.now() - start,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

class ExecutionLogHandle {
  _outputTable?: string;
  _outputId?: string;
  _outputAction?: "created" | "updated";
  _runId?: string;

  setOutput(table: string, id: string, action: "created" | "updated") {
    this._outputTable = table;
    this._outputId = id;
    this._outputAction = action;
  }

  /** Available after withExecutionLog resolves. */
  get runId(): string | undefined {
    return this._runId;
  }
}
