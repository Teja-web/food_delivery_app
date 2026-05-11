/**
 * Phase transitions — pure domain logic (no DB, no framework).
 *
 * The six SDLC phases progress linearly:
 *   requirements → design → development → testing → cicd → monitoring
 *
 * `monitoring` is terminal; rollback only happens via explicit `setPhase`
 * (intended for incident response, not the normal flow).
 */

import { PROJECT_PHASES, type ProjectPhase } from "@/db/schema/project";

const ORDER: ProjectPhase[] = [...PROJECT_PHASES];

export function nextPhase(current: ProjectPhase): ProjectPhase | null {
  const idx = ORDER.indexOf(current);
  if (idx === -1 || idx === ORDER.length - 1) return null;
  return ORDER[idx + 1];
}

export function previousPhase(current: ProjectPhase): ProjectPhase | null {
  const idx = ORDER.indexOf(current);
  if (idx <= 0) return null;
  return ORDER[idx - 1];
}

export function canAdvanceFrom(current: ProjectPhase): boolean {
  return nextPhase(current) !== null;
}

export function isPhaseAfter(a: ProjectPhase, b: ProjectPhase): boolean {
  return ORDER.indexOf(a) > ORDER.indexOf(b);
}
