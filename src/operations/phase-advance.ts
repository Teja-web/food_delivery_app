/**
 * Auto-advance the project phase when every gate of the current phase is
 * `passed` or `skipped`. Borrowed pattern from `ai-sdlc-framework`'s
 * `apps/web/src/lib/phase-helpers.ts` (commit 5880737).
 *
 * Called from `decideApproval` after a `phase_gate` approval lands as
 * `approved`. Writes an `audit_log` row plus one in-app notification per
 * org member so the cockpit cards update on the next visit (and the
 * H3 inbox surfaces the phase change as a feed entry).
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { member } from "@/db/schema/auth";
import { auditLogs } from "@/db/schema/audit-log";
import { notifications } from "@/db/schema/notification";
import { phaseGates } from "@/db/schema/phase-gate";
import { projects } from "@/db/schema/project";
import { nextPhase, PHASE_GUIDANCE } from "@/domain/phases";
import { safeRevalidate } from "@/lib/safe-revalidate";

export type AdvanceResult =
  | { advanced: false; reason: "not_found" | "terminal_phase" | "gates_unmet" }
  | { advanced: true; fromPhase: string; toPhase: string };

export async function tryAdvancePhase(args: {
  organizationId: string;
  projectId: string;
  triggeredByName: string;
}): Promise<AdvanceResult> {
  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, args.projectId),
      eq(projects.organizationId, args.organizationId),
    ),
  });
  if (!project) return { advanced: false, reason: "not_found" };

  const next = nextPhase(project.phase);
  if (!next) return { advanced: false, reason: "terminal_phase" };

  const gates = await db.query.phaseGates.findMany({
    where: and(
      eq(phaseGates.projectId, project.id),
      eq(phaseGates.phase, project.phase),
    ),
  });
  // No gates at all → don't auto-advance (avoids silently flipping phases for
  // projects that haven't been set up). Upstream uses the same guard.
  if (gates.length === 0) return { advanced: false, reason: "gates_unmet" };
  const allCleared = gates.every((g) => g.status === "passed" || g.status === "skipped");
  if (!allCleared) return { advanced: false, reason: "gates_unmet" };

  const now = new Date();
  const fromPhase = project.phase;
  await db
    .update(projects)
    .set({ phase: next, updatedAt: now })
    .where(eq(projects.id, project.id));

  await db.insert(auditLogs).values({
    organizationId: args.organizationId,
    actorType: "system",
    actorName: args.triggeredByName,
    action: "project.phase_advanced",
    entityType: "project",
    entityId: project.id,
    summary: `${project.name}: ${fromPhase} → ${next} (all ${gates.length} gates cleared)`,
    before: { phase: fromPhase } as Record<string, unknown>,
    after: { phase: next } as Record<string, unknown>,
  });

  // One in-app notification per org member.
  const members = await db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, args.organizationId));
  if (members.length > 0) {
    const nextLabel = PHASE_GUIDANCE[next].label;
    await db.insert(notifications).values(
      members.map((m) => ({
        organizationId: args.organizationId,
        recipientId: m.userId,
        channel: "in_app" as const,
        subject: `Phase advanced to ${nextLabel}`,
        body: `${project.name} moved from ${PHASE_GUIDANCE[fromPhase].label} to ${nextLabel} — all ${gates.length} gates cleared.`,
        link: `/projects/${project.id}`,
        entityType: "project",
        entityId: project.id,
      })),
    );
  }

  safeRevalidate(`/projects/${project.id}`);
  safeRevalidate("/projects");

  return { advanced: true, fromPhase, toPhase: next };
}
