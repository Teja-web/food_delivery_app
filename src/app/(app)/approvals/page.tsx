import { and, desc, eq, inArray } from "drizzle-orm";

import { AUTONOMY_LABELS, type AutonomyLevel } from "@/components/trust/AutonomyPill";
import { Toaster } from "@/components/ui/sonner";
import { db } from "@/db/client";
import { approvals, type Approval } from "@/db/schema/approval";
import { skills } from "@/db/schema/skill";
import { getActionContext } from "@/lib/auth/context";
import { getSkillAutonomy } from "@/operations/skill-autonomy";

import { ApprovalsPageClient } from "./ApprovalsPageClient";
import { parseSkillSlug, serializeApprovalRow, type ApprovalsInboxClient } from "./serialize";

export default async function ApprovalsPage() {
  const ctx = await getActionContext();
  const rows: Approval[] = await db
    .select()
    .from(approvals)
    .where(
      and(eq(approvals.organizationId, ctx.organizationId), eq(approvals.status, "pending")),
    )
    .orderBy(desc(approvals.createdAt));

  // Resolve real autonomy levels for bot-requested rows. Until approvals carry
  // a real skillId, we parse the slug out of `requestedByName` ("foo-skill (bot)")
  // and look up the org-wide autonomy row.
  const slugs = new Set<string>();
  for (const a of rows) {
    if (!a.requestedByName) continue;
    const slug = parseSkillSlug(a.requestedByName);
    if (slug) slugs.add(slug);
  }
  const skillLevelBySlug = new Map<string, AutonomyLevel>();
  if (slugs.size > 0) {
    const skillRows = await db
      .select({ id: skills.id, slug: skills.slug })
      .from(skills)
      .where(
        and(
          eq(skills.organizationId, ctx.organizationId),
          inArray(skills.slug, [...slugs]),
        ),
      );
    const states = await Promise.all(
      skillRows.map(async (s) => ({ slug: s.slug, state: await getSkillAutonomy(s.id, null) })),
    );
    for (const { slug, state } of states) {
      skillLevelBySlug.set(slug, AUTONOMY_LABELS[state.levelName]);
    }
  }

  const serialized = rows.map((row) => serializeApprovalRow(row, skillLevelBySlug));

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
