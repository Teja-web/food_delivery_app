import { z } from "zod/v4";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { phaseGates, GATE_TYPES, GATE_STATUSES, type GateStatus } from "@/db/schema/phase-gate";
import { PROJECT_PHASES, type ProjectPhase } from "@/db/schema/project";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const phaseGateSchema = z.object({
  projectId: z.string().min(1),
  phase: z.enum(PROJECT_PHASES),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(GATE_TYPES),
  threshold: z.number().optional(),
  status: z.enum(GATE_STATUSES).default("pending"),
});

export const phaseGateCrud = createEntityCrud({
  db,
  table: phaseGates,
  queryKey: "phaseGates",
  idField: "id",
  schema: phaseGateSchema,
  onMutate: () => safeRevalidate("/projects"),
});

export async function listGatesForPhase(projectId: string, phase: ProjectPhase) {
  const ctx = await getActionContext();
  return db.query.phaseGates.findMany({
    where: and(
      eq(phaseGates.projectId, projectId),
      eq(phaseGates.phase, phase),
      eq(phaseGates.organizationId, ctx.organizationId),
    ),
  });
}

export async function setGateStatus(gateId: string, status: GateStatus, comment?: string) {
  const ctx = await getActionContext();
  await db
    .update(phaseGates)
    .set({ status, comment, evaluatedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(phaseGates.id, gateId), eq(phaseGates.organizationId, ctx.organizationId)));
  safeRevalidate("/projects");
}

export interface UnmetGate {
  id: string;
  name: string;
  type: (typeof GATE_TYPES)[number];
  status: GateStatus;
}

/** Returns the list of gates blocking advancement (empty = clear to proceed). */
export async function findUnmetGates(projectId: string, phase: ProjectPhase): Promise<UnmetGate[]> {
  const ctx = await getActionContext();
  const rows = await db.query.phaseGates.findMany({
    where: and(
      eq(phaseGates.projectId, projectId),
      eq(phaseGates.phase, phase),
      eq(phaseGates.organizationId, ctx.organizationId),
      inArray(phaseGates.status, ["pending", "failed"]),
    ),
  });
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, status: r.status }));
}
