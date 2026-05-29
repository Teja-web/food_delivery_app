import { and, desc, eq, inArray } from "drizzle-orm";

import { AUTONOMY_LABELS, type AutonomyLevel } from "@/components/trust/AutonomyPill";
import { Toaster } from "@/components/ui/sonner";
import { db } from "@/db/client";
import { approvals, type Approval } from "@/db/schema/approval";
import { plans } from "@/db/schema/plan";
import { phaseGates } from "@/db/schema/phase-gate";
import { skills } from "@/db/schema/skill";
import { workItems } from "@/db/schema/work-item";
import { getActionContext } from "@/lib/auth/context";
import { getSkillAutonomy, LEVEL_NAMES } from "@/operations/skill-autonomy";

import { ApprovalsPageClient } from "./ApprovalsPageClient";
import {
  parseAgentSlugFromId,
  parseSkillSlug,
  serializeApprovalRow,
  type ApprovalRowResolution,
  type ApprovalsInboxClient,
} from "./serialize";

export default async function ApprovalsPage() {
  const ctx = await getActionContext();
  const rows: Approval[] = await db
    .select()
    .from(approvals)
    .where(
      and(eq(approvals.organizationId, ctx.organizationId), eq(approvals.status, "pending")),
    )
    .orderBy(desc(approvals.createdAt));

  // Resolve real autonomy levels per approval row. Two slug sources:
  //   - legacy: `requestedByName` like `"foo-skill (bot)"`
  //   - milestone-D `skill_invocation`: `requestedById` like `"agent:<slug>"`
  //
  // For `skill_invocation` rows the current level is looked up per-project
  // (mirroring the gate in handlePreToolUse), and the skill's
  // `minAutonomyLevel` is exposed so the inbox can render the gap.
  function slugFor(a: Approval): string | null {
    return (
      parseAgentSlugFromId(a.requestedById) ??
      (a.requestedByName ? parseSkillSlug(a.requestedByName) : null)
    );
  }

  const uniqueSlugs = Array.from(new Set(rows.map(slugFor).filter((s): s is string => s !== null)));
  const skillBySlug = new Map<string, { id: string; minAutonomyLevel: number }>();
  if (uniqueSlugs.length > 0) {
    const skillRows = await db
      .select({
        id: skills.id,
        slug: skills.slug,
        minAutonomyLevel: skills.minAutonomyLevel,
      })
      .from(skills)
      .where(
        and(
          eq(skills.organizationId, ctx.organizationId),
          inArray(skills.slug, uniqueSlugs),
        ),
      );
    for (const s of skillRows) {
      skillBySlug.set(s.slug, { id: s.id, minAutonomyLevel: s.minAutonomyLevel });
    }
  }

  // Batch-resolve target titles per entity-type. Splitting by type means one
  // DB hit per (entity-type that has pending approvals), not one per row. The
  // result map is keyed on entityId; misses are silently OK and fall through
  // to the placeholder in resolveTitle.
  const titleByEntityId = new Map<string, string>();
  const groupedIds = new Map<string, Set<string>>();
  for (const a of rows) {
    if (!groupedIds.has(a.entityType)) groupedIds.set(a.entityType, new Set());
    groupedIds.get(a.entityType)!.add(a.entityId);
  }
  const planIds = Array.from(groupedIds.get("plan") ?? []);
  const releaseIds = Array.from(groupedIds.get("release") ?? []);
  const workItemIds = Array.from(groupedIds.get("work_item") ?? []);
  const gateIds = Array.from(groupedIds.get("phase_gate") ?? []);
  // Both `plan` and `release` resolve via the plans table — releases are
  // stored as plans with `kind=release_plan`.
  const planLikeIds = [...planIds, ...releaseIds];
  if (planLikeIds.length > 0) {
    const r = await db
      .select({ id: plans.id, title: plans.title })
      .from(plans)
      .where(
        and(
          eq(plans.organizationId, ctx.organizationId),
          inArray(plans.id, planLikeIds),
        ),
      );
    for (const p of r) titleByEntityId.set(p.id, p.title);
  }
  if (workItemIds.length > 0) {
    const r = await db
      .select({ id: workItems.id, title: workItems.title })
      .from(workItems)
      .where(
        and(
          eq(workItems.organizationId, ctx.organizationId),
          inArray(workItems.id, workItemIds),
        ),
      );
    for (const w of r) titleByEntityId.set(w.id, w.title);
  }
  if (gateIds.length > 0) {
    const r = await db
      .select({ id: phaseGates.id, name: phaseGates.name })
      .from(phaseGates)
      .where(
        and(
          eq(phaseGates.organizationId, ctx.organizationId),
          inArray(phaseGates.id, gateIds),
        ),
      );
    for (const g of r) titleByEntityId.set(g.id, g.name);
  }

  const resolutionByApprovalId = new Map<string, ApprovalRowResolution>();
  await Promise.all(
    rows.map(async (a) => {
      const targetTitle = titleByEntityId.get(a.entityId) ?? null;
      const slug = slugFor(a);
      const skill = slug ? skillBySlug.get(slug) : undefined;
      const requiredAutonomyLevel = skill
        ? AUTONOMY_LABELS[LEVEL_NAMES[skill.minAutonomyLevel] ?? "observe"]
        : null;

      if (!skill) {
        resolutionByApprovalId.set(a.id, { targetTitle });
        return;
      }

      if (a.entityType === "skill_invocation") {
        const perProject = await getSkillAutonomy(skill.id, a.projectId);
        const effective =
          perProject.level > 0 ? perProject : await getSkillAutonomy(skill.id, null);
        resolutionByApprovalId.set(a.id, {
          skillLevel: AUTONOMY_LABELS[effective.levelName],
          requiredAutonomyLevel,
          targetTitle,
        });
        return;
      }
      const orgWide = await getSkillAutonomy(skill.id, null);
      resolutionByApprovalId.set(a.id, {
        skillLevel: AUTONOMY_LABELS[orgWide.levelName],
        targetTitle,
      });
    }),
  );

  const serialized = rows.map((row) =>
    serializeApprovalRow(row, resolutionByApprovalId.get(row.id) ?? {}),
  );

  const data: ApprovalsInboxClient = {
    tabs: {
      mine: serialized.filter((a) => a.autoEligible || a.isBotRequester).length,
      team: serialized.length,
      all: serialized.length,
    },
    approvals: serialized,
    currentUserId: ctx.userId,
  };

  return (
    <>
      <ApprovalsPageClient data={data} />
      <Toaster />
    </>
  );
}
