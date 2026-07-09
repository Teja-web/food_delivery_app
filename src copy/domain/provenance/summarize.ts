/**
 * Provenance summary — counts and ratios for the SummaryPanel UI.
 *
 * Pure function over an array of plan or work-item rows. Returns the
 * minimum surface the SummaryPanel needs: AI-authored ratio, model mix,
 * skill mix, autonomy snapshot distribution. Never reads code, never
 * reads prompt bodies — provenance UI is *counts*, not content.
 *
 * Coznt is not a Git host. This is the only legitimate provenance
 * rendering inside coznt UI; the per-line overlay belongs in the
 * GitHub/GitLab PR view, written by the PR comment bot (M-C / D).
 */

import { isAiAuthored } from "./record";

export interface ProvenanceBearer {
  aiAuthored?: boolean | null;
  generatedByModel?: string | null;
  generatedBySkillId?: string | null;
  autonomyAtGeneration?: number | null;
}

export interface ProvenanceSummary {
  /** Total entities in the input set. */
  total: number;
  /** Count of entities with aiAuthored === true. */
  aiAuthored: number;
  /** Ratio aiAuthored / total, in [0, 1]. Zero when total is zero. */
  aiAuthoredRatio: number;
  /** Per-model count among AI-authored rows. */
  modelMix: Record<string, number>;
  /** Per-skill count among AI-authored rows. Skill IDs only; resolve names in the UI. */
  skillMix: Record<string, number>;
  /** Per-autonomy-level count at generation time (0..N). */
  autonomyDistribution: Record<number, number>;
}

export function summarizeProvenance(rows: ProvenanceBearer[]): ProvenanceSummary {
  const summary: ProvenanceSummary = {
    total: rows.length,
    aiAuthored: 0,
    aiAuthoredRatio: 0,
    modelMix: {},
    skillMix: {},
    autonomyDistribution: {},
  };

  for (const row of rows) {
    if (!isAiAuthored(row)) continue;
    summary.aiAuthored += 1;
    if (row.generatedByModel) {
      summary.modelMix[row.generatedByModel] = (summary.modelMix[row.generatedByModel] ?? 0) + 1;
    }
    if (row.generatedBySkillId) {
      summary.skillMix[row.generatedBySkillId] = (summary.skillMix[row.generatedBySkillId] ?? 0) + 1;
    }
    if (row.autonomyAtGeneration !== null && row.autonomyAtGeneration !== undefined) {
      const level = row.autonomyAtGeneration;
      summary.autonomyDistribution[level] = (summary.autonomyDistribution[level] ?? 0) + 1;
    }
  }

  summary.aiAuthoredRatio = summary.total === 0 ? 0 : summary.aiAuthored / summary.total;
  return summary;
}
