import { and, desc, eq, inArray } from "drizzle-orm";

import { AUTONOMY_LABELS, type AutonomyLevel } from "@/components/trust/AutonomyPill";
import { Toaster } from "@/components/ui/sonner";
import { db } from "@/db/client";
import { approvals, type Approval } from "@/db/schema/approval";
import { skills } from "@/db/schema/skill";
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

  const resolutionByApprovalId = new Map<string, ApprovalRowResolution>();
  await Promise.all(
    rows.map(async (a) => {
      const slug = slugFor(a);
      if (!slug) return;
      const skill = skillBySlug.get(slug);
      if (!skill) return;
      const requiredName = LEVEL_NAMES[skill.minAutonomyLevel] ?? "intern";
      const requiredAutonomyLevel = AUTONOMY_LABELS[requiredName];

      if (a.entityType === "skill_invocation") {
        const perProject = await getSkillAutonomy(skill.id, a.projectId);
        const effective =
          perProject.level > 0 ? perProject : await getSkillAutonomy(skill.id, null);
        resolutionByApprovalId.set(a.id, {
          skillLevel: AUTONOMY_LABELS[effective.levelName],
          requiredAutonomyLevel,
        });
        return;
      }
      const orgWide = await getSkillAutonomy(skill.id, null);
      resolutionByApprovalId.set(a.id, {
        skillLevel: AUTONOMY_LABELS[orgWide.levelName],
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
