import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActionContext } from "@/lib/auth/context";
import { isPromptGovernanceEnabled } from "@/domain/prompt-quality/feature-flag";
import { getPromptDetail } from "@/operations/prompt/prompt-log";
import { cn } from "@/lib/utils";

const TIER_TONE: Record<"GOOD" | "NEEDS_IMPROVEMENT" | "POOR", string> = {
  GOOD: "border-trend-up/40 text-trend-up",
  NEEDS_IMPROVEMENT: "border-state-pending/40 text-state-pending",
  POOR: "border-state-failed/40 text-state-failed",
};

function formatAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

interface ScoreDetail {
  dimensions?: {
    clarity?: number;
    context?: number;
    specificity?: number;
    constraints?: number;
    phaseFit?: number;
    safety?: number;
  };
  suggestions?: string[];
  flags?: string[];
}

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ id: string; promptId: string }>;
}) {
  if (!isPromptGovernanceEnabled()) notFound();
  const { id: projectId, promptId } = await params;
  const ctx = await getActionContext();
  const prompt = await getPromptDetail(ctx.organizationId, promptId);
  if (!prompt || prompt.projectId !== projectId) notFound();

  const detail = (prompt.promptScoreDetail ?? {}) as ScoreDetail;
  const dimensions = detail.dimensions ?? {};
  const suggestions = detail.suggestions ?? [];
  const flags = detail.flags ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/projects/${projectId}`}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
          >
            ← {prompt.project?.name ?? "project"}
          </Link>
          <h1 className="mt-1 font-semibold text-foreground">Prompt {prompt.id}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {prompt.role} · {prompt.source} · {prompt.authorName ?? "—"} · {formatAge(prompt.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {prompt.promptTier ? (
            <Badge
              variant="outline"
              className={cn(
                "px-2 py-0.5 font-mono text-xs uppercase",
                TIER_TONE[prompt.promptTier],
              )}
            >
              {prompt.promptScore ?? "—"} · {prompt.promptTier}
            </Badge>
          ) : (
            <Badge variant="outline" className="px-2 py-0.5 font-mono text-xs">
              not scored
            </Badge>
          )}
          {prompt.rubricVersion ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              rubric {prompt.rubricVersion}
            </span>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Content
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <pre className="whitespace-pre-wrap rounded bg-muted/40 p-3 font-mono text-xs text-foreground/85">
            {prompt.content}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Dimensions
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(
              [
                "clarity",
                "context",
                "specificity",
                "constraints",
                "phaseFit",
                "safety",
              ] as const
            ).map((k) => (
              <div key={k} className="rounded border border-border/40 px-3 py-2">
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {k}
                </dt>
                <dd className="mt-1 font-mono text-lg tabular-nums text-foreground">
                  {dimensions[k] ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {suggestions.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/85">
              {suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {flags.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Flags
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {flags.map((f) => (
                <Badge
                  key={f}
                  variant="outline"
                  className="px-1.5 py-0 font-mono text-[10px] text-muted-foreground"
                >
                  {f}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Attribution
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 pt-0 font-mono text-xs text-foreground/85">
          <div>author: {prompt.authorName ?? "—"} &lt;{prompt.authorEmail ?? "—"}&gt; ({prompt.authorUsername ?? "—"})</div>
          <div>source: {prompt.source}</div>
          <div>
            session:{" "}
            {prompt.mcpSessionId ? (
              <Link
                href={`/audit?entity=${prompt.mcpSessionId}`}
                className="underline hover:text-foreground"
              >
                {prompt.mcpSessionId}
              </Link>
            ) : (
              "—"
            )}
          </div>
          <div>captured: {prompt.createdAt.toISOString()}</div>
          {prompt.scoredAt ? <div>scored: {prompt.scoredAt.toISOString()}</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
