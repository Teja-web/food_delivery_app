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

import { recomputeSkillAutonomyTask } from "@/automations/tasks/recompute-skill-autonomy";

const rules: Rule[] = [
  // SDLC rules land here as automations/tasks/* files are added.
  {
    // Each new skill_outcomes row recomputes the autonomy ledger for its
    // skill. The task itself looks up the row to discover skillId; see
    // src/automations/tasks/recompute-skill-autonomy.ts for the lookup note.
    id: "skill_outcome:insert",
    entityType: "skill_outcome",
    operation: "insert",
    tasks: [recomputeSkillAutonomyTask],
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
