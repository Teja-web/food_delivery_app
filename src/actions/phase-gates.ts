"use server";

import { phaseGateCrud, listGatesForPhase, setGateStatus, findUnmetGates } from "@/operations/phase-gates";

export async function createGate(input: Parameters<typeof phaseGateCrud.create>[0]) {
  return phaseGateCrud.create(input);
}

export async function updateGate(id: string, input: Parameters<typeof phaseGateCrud.update>[1]) {
  return phaseGateCrud.update(id, input);
}

export async function deleteGate(id: string) {
  return phaseGateCrud.delete(id);
}

export { listGatesForPhase, setGateStatus, findUnmetGates };
