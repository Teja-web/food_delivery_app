/**
 * Provenance record helper.
 *
 * Called from agent-path inserts (skills, tasks under `src/automations/`)
 * to populate the provenance columns on `plans` and `work_items` atomically
 * with the row write. Looks up the skill's current autonomy level on the
 * target project so a snapshot is captured at the moment of generation —
 * not at the moment of later review.
 *
 * Legacy / hand-authored rows leave these fields unset and aiAuthored
 * stays false. We never manufacture provenance retroactively
 * (verification-debt thesis: never self-report).
 */

import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { getSkillAutonomy } from "@/operations/skill/skill-autonomy";

export interface ProvenanceInput {
  /** Skill that produced the row. Required — without it there is no provenance. */
  skillId: string;
  /** Project the row lives in. Used to snapshot per-project autonomy. */
  projectId: string | null;
  /** Model identifier (e.g. "claude-opus-4-7"). */
  model: string;
  /** The prompt text that produced this output. Hashed; never stored raw here. */
  prompt: string;
  /** Optional explicit generation timestamp; defaults to now. */
  generatedAt?: Date;
}

export interface ProvenanceColumns {
  aiAuthored: true;
  generatedByModel: string;
  generatedBySkillId: string;
  autonomyAtGeneration: number;
  promptHash: string;
  generatedAt: Date;
}

/**
 * Build the provenance column values for an agent-path insert. The caller
 * spreads the return into their `db.insert(table).values({...})` call so
 * the columns are written atomically with the rest of the row.
 *
 * Snapshots `skill_autonomy.level` at the moment of generation — even if
 * the skill is later promoted/demoted, this row remembers what authority
 * the agent had when it produced the output.
 */
export async function buildProvenance(input: ProvenanceInput): Promise<ProvenanceColumns> {
  const autonomy = await getSkillAutonomy(input.skillId, input.projectId);
  return {
    aiAuthored: true,
    generatedByModel: input.model,
    generatedBySkillId: input.skillId,
    autonomyAtGeneration: autonomy.level,
    promptHash: hashPrompt(input.prompt),
    generatedAt: input.generatedAt ?? new Date(),
  };
}

/**
 * Stable SHA-256 of the prompt text. Used for dedupe and audit; never
 * stored alongside the raw prompt (that's prompt_logs' job).
 */
export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

/**
 * Type guard for "this entity carries provenance" — used by serializers
 * and the SummaryPanel component to filter rows before counting.
 */
export function isAiAuthored<T extends { aiAuthored?: boolean | null }>(
  row: T,
): row is T & { aiAuthored: true } {
  return row.aiAuthored === true;
}
