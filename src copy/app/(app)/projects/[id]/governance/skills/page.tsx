import { and, desc, eq, inArray } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { skillAutonomy } from "@/db/schema/skill/skill-autonomy";
import { skills } from "@/db/schema/skill/skill";
import { getActionContext } from "@/lib/auth/context";

const LEVEL_NAMES = ["observe", "propose", "merge", "lead"] as const;

export default async function GovernanceSkillsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getActionContext();

  const autonomyRows = await db
    .select({
      skillId: skillAutonomy.skillId,
      level: skillAutonomy.level,
      levelSetAt: skillAutonomy.levelSetAt,
      lastReason: skillAutonomy.lastReason,
    })
    .from(skillAutonomy)
    .where(
      and(
        eq(skillAutonomy.organizationId, ctx.organizationId),
        eq(skillAutonomy.projectId, id),
      ),
    )
    .orderBy(desc(skillAutonomy.level), desc(skillAutonomy.levelSetAt));

  const skillIds = autonomyRows.map((r) => r.skillId);
  const skillMeta = new Map<string, { name: string; slug: string }>();
  if (skillIds.length > 0) {
    const rows = await db
      .select({ id: skills.id, name: skills.name, slug: skills.slug })
      .from(skills)
      .where(inArray(skills.id, skillIds));
    for (const r of rows) skillMeta.set(r.id, { name: r.name, slug: r.slug });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Per-skill autonomy on this project. Levels: observe → propose → merge → lead.
      </p>

      {autonomyRows.length === 0 ? (
        <div className="rounded border bg-muted/20 p-6 text-sm text-muted-foreground">
          No skill autonomy yet — every (skill, project) pair starts at observe.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-3 py-2 font-medium">Skill</th>
              <th className="px-3 py-2 font-medium">Level</th>
              <th className="px-3 py-2 font-medium">Set at</th>
              <th className="px-3 py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {autonomyRows.map((r) => {
              const meta = skillMeta.get(r.skillId);
              return (
                <tr key={r.skillId} className="border-b hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <a href={`/skills/${r.skillId}`} className="font-medium hover:underline">
                      {meta?.name ?? r.skillId.slice(0, 12)}
                    </a>
                    {meta?.slug ? (
                      <div className="font-mono text-xs text-muted-foreground">
                        {meta.slug}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      {LEVEL_NAMES[r.level] ?? r.level}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {new Date(r.levelSetAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.lastReason ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
