/**
 * Rules Engine — flat rule map.
 *
 * PG trigger → pgmq → worker → matchRules(event) → call functions sequentially.
 *
 * Each rule matches an entityType + operation (insert/update) and optionally
 * a condition. The worker drains the queue and invokes every matched rule's
 * tasks with the same `TaskParams`. New SDLC tasks register here as they're
 * implemented in `src/automations/tasks/`.
 */

import { assessOutcomesTask } from "@/automations/tasks/assess-outcomes";
import { embedProjectLearningTask } from "@/automations/tasks/embed-project-learning";
import { processWebhookEvent } from "@/automations/tasks/process-webhook-event";
import { computeWorkItemLeadTime } from "@/automations/tasks/compute-work-item-lead-time";
import { recomputeSkillAutonomyTask } from "@/automations/tasks/recompute-skill-autonomy";

export interface CrudEvent {
  entityType: string;
  operation: "insert" | "update" | "delete";
  entityId: string;
  organizationId: string;
  userId?: string;
  userName?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
}

export interface TaskParams {
  organizationId: string;
  entityId: string;
  /** Source entity table (e.g. "projects", "work_items"). Tasks can ignore. */
  entityType?: string;
  /** CRUD operation that produced the event. Tasks can ignore. */
  operation?: "insert" | "update" | "delete";
  traceId?: string;
  data?: Record<string, unknown>;
}

export interface Rule {
  id: string;
  entityType: string;
  operation: "insert" | "update";
  condition?: (event: CrudEvent) => boolean;
  tasks: Array<(params: TaskParams) => Promise<unknown>>;
}

export function changedTo(event: CrudEvent, field: string, value: unknown): boolean {
  const oldVal = event.oldData?.[field];
  const newVal = event.newData?.[field];
  return newVal === value && oldVal !== value;
}

export function changed(event: CrudEvent, field: string): boolean {
  return event.oldData?.[field] !== event.newData?.[field];
}

const rules: Rule[] = [
  {
    id: "webhook_event:insert",
    entityType: "webhook_event",
    operation: "insert",
    tasks: [processWebhookEvent],
  },
  {
    id: "work_item:status_terminal",
    entityType: "work_item",
    operation: "update",
    condition: (e) => {
      const next = (e.newData?.status as string | undefined)?.toLowerCase();
      const prev = (e.oldData?.status as string | undefined)?.toLowerCase();
      const TERMINAL = new Set(["done", "closed", "resolved", "merged"]);
      return !!next && next !== prev && TERMINAL.has(next);
    },
    tasks: [computeWorkItemLeadTime],
  },
  {
    // Each new skill_outcomes row recomputes the autonomy ledger for its
    // skill. The task itself looks up the row to discover skillId; see
    // src/automations/tasks/recompute-skill-autonomy.ts for the lookup note.
    id: "skill_outcome:insert",
    entityType: "skill_outcome",
    operation: "insert",
    tasks: [recomputeSkillAutonomyTask],
  },
  {
    // pg_cron tick. The cron expression in `scripts/db-setup.ts`
    // setupCronJobs() enqueues a synthetic `cron_tick:insert` event
    // with `entityId = 'assess-outcomes'`. The condition keeps this
    // rule from firing for any other future cron_tick entityId.
    id: "cron_tick:assess-outcomes",
    entityType: "cron_tick",
    operation: "insert",
    condition: (e) => e.entityId === "assess-outcomes",
    tasks: [assessOutcomesTask],
  },
  {
    // Project learnings become semantically searchable. The task fetches
    // the row, generates an embedding, and upserts `coznt.documents`.
    // Soft-deletes (deletedAt set on update) trigger removal from the
    // index. See `add-coznt-knowledge-surface`.
    id: "project_learning:insert",
    entityType: "projectLearning",
    operation: "insert",
    tasks: [embedProjectLearningTask],
  },
  {
    id: "project_learning:update",
    entityType: "projectLearning",
    operation: "update",
    condition: (e) =>
      changed(e, "body") || changed(e, "deletedAt"),
    tasks: [embedProjectLearningTask],
  },
];

export function matchRules(event: CrudEvent): Rule[] {
  return rules.filter(
    (r) =>
      r.entityType === event.entityType &&
      r.operation === event.operation &&
      (!r.condition || r.condition(event)),
  );
}

export function listRules(): readonly Rule[] {
  return rules;
}
