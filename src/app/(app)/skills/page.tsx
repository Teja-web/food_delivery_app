import { listSkills } from "@/actions/skills";
import { getSkillAutonomyAction } from "@/actions/skill-autonomy";
import { LEVEL_BLURBS, type SkillAutonomyState } from "@/operations/skill-autonomy";

function relativeTime(date: Date | null): string {
  if (!date) return "never";
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const sign = diffMs < 0 ? "ago" : "from now";
  const minutes = Math.round(abs / 60_000);
  if (minutes < 60) return `${minutes}m ${sign}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ${sign}`;
  const days = Math.round(hours / 24);
  return `${days}d ${sign}`;
}

function levelPillClass(level: number): string {
  // 0 intern → muted; 1 junior → blue; 2 senior → green; 3 principal → violet.
  if (level >= 3) return "bg-violet-100 text-violet-800 border-violet-200";
  if (level >= 2) return "bg-green-100 text-green-800 border-green-200";
  if (level >= 1) return "bg-blue-100 text-blue-800 border-blue-200";
  return "bg-muted text-muted-foreground border-border";
}

export default async function SkillsPage() {
  const { items } = await listSkills({ limit: 100 });

  // Per-skill fetch is fine for v1 — skills lists are small.
  const autonomyByID = new Map<string, SkillAutonomyState>();
  await Promise.all(
    items.map(async (s: { id: string }) => {
      autonomyByID.set(s.id, await getSkillAutonomyAction(s.id));
    }),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Skills</h1>
      {items.length === 0 ? (
        <div className="rounded border bg-muted/30 p-8 text-sm text-muted-foreground">
          No skills yet. Skills are reusable agent workflows callable over the HTTP API.
        </div>
      ) : (
        <ul className="divide-y rounded border">
          {items.map((s: { id: string; name: string; slug: string; projectId: string | null; enabled: boolean; description: string | null }) => {
            const autonomy = autonomyByID.get(s.id);
            const level = autonomy?.level ?? 0;
            const levelName = autonomy?.levelName ?? "intern";
            const blurb = LEVEL_BLURBS[levelName] ?? "";
            return (
              <li key={s.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.slug}
                      {s.projectId ? "" : " · org-wide"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${levelPillClass(level)}`}
                      title={autonomy?.lastReason ?? undefined}
                    >
                      {levelName}
                      {blurb ? <span className="ml-1 font-normal opacity-80">· {blurb}</span> : null}
                    </span>
                    <span className={s.enabled ? "text-green-600" : "text-muted-foreground"}>
                      {s.enabled ? "enabled" : "disabled"}
                    </span>
                  </div>
                </div>
                {s.description ? <p className="mt-1 text-xs text-muted-foreground">{s.description}</p> : null}
                {autonomy?.nextReviewAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    next autonomy review {relativeTime(autonomy.nextReviewAt)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
