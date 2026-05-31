"use server";

import { getActionContext } from "@/lib/auth/context";
import {
  phaseGateCrud,
  listGatesForPhase,
  listGatesForProject,
  setGateStatus,
  findUnmetGates,
} from "@/operations/phase-gates";
import { recordOverride, clearOverride } from "@/operations/gate-overrides";
import { getSkillAutonomy } from "@/operations/skill-autonomy";

export async function createGate(input: Parameters<typeof phaseGateCrud.create>[0]) {
  return phaseGateCrud.create(input);
}

export async function updateGate(id: string, input: Parameters<typeof phaseGateCrud.update>[1]) {
  return phaseGateCrud.update(id, input);
}

export async function deleteGate(id: string) {
  return phaseGateCrud.delete(id);
}

/**
 * Override a gate — auditable "skip with reason." The caller must reference
 * the Plan that authorizes the override (ADR, exception request, etc.).
 *
 * `actingSkillId` is optional: when provided, we snapshot the skill's
 * current autonomy level on the gate's project so the override row is
 * defensible against the actor's then-current authority. Hand-overrides
 * (no skill) record autonomy as 0 — the human is acting outside the
 * autonomy ladder.
 */
export async function overrideGate(input: {
  gateId: string;
  reason: string;
  authorizingPlanId: string;
  actingSkillId?: string | null;
  projectId?: string | null;
}) {
  const ctx = await getActionContext();
  let autonomyAtTime = 0;
  if (input.actingSkillId) {
    const autonomy = await getSkillAutonomy(input.actingSkillId, input.projectId ?? null);
    autonomyAtTime = autonomy.level;
  }
  await recordOverride({
    gateId: input.gateId,
    overriddenById: ctx.user.id,
    reason: input.reason,
    authorizingPlanId: input.authorizingPlanId,
    autonomyAtTime,
  });
}

export async function clearGateOverride(gateId: string) {
  await getActionContext(); // ensure caller is authenticated
  await clearOverride(gateId);
}

export { listGatesForPhase, listGatesForProject, setGateStatus, findUnmetGates };
