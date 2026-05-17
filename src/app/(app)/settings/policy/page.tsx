/**
 * /settings/policy — Per-phase tool discipline.
 *
 * Operator-readable rendering of `src/mcp/phase-tool-map.ts`. Shows which
 * MCP verbs are allowed in which SDLC phase, with the always-allowed set
 * called out separately. This is platform configuration (declared in
 * source), not org-editable — the page is read-only by design.
 *
 * Closes positioning.md Pillar 7 (Per-phase tool discipline): "Each phase
 * declares allowed and forbidden actions explicitly... stops being a wiki
 * page and starts being a 409 on the wire."
 */

import { ChevronLeft, Check, Minus, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ALWAYS_ALLOWED, PHASES, TOOL_PHASE_MAP, type Phase } from "@/mcp/phase-tool-map";
import { cn } from "@/lib/utils";

const PHASE_LABEL: Record<Phase, string> = {
  requirements: "Req",
  design: "Design",
  development: "Dev",
  testing: "Test",
  cicd: "CI/CD",
  monitoring: "Monitor",
};

const PHASE_TONE: Record<Phase, string> = {
  requirements: "text-muted-foreground",
  design: "text-autonomy-junior",
  development: "text-autonomy-senior",
  testing: "text-state-pending",
  cicd: "text-autonomy-principal",
  monitoring: "text-trend-up",
};

export default function PhaseToolPolicyPage() {
  const alwaysAllowed = Array.from(ALWAYS_ALLOWED).sort();
  const phaseGated = Object.entries(TOOL_PHASE_MAP)
    .map(([verb, phases]) => ({ verb, phases: new Set(phases) }))
    .sort((a, b) => a.verb.localeCompare(b.verb));

  return (
    <div className="max-w-5xl space-y-6">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Settings
      </Link>

      <header>
        <h1 className="font-display text-2xl font-semibold">Tool discipline</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Which MCP verbs are allowed in which SDLC phase. The route-side execution gate
          enforces this — calling a verb outside its allowed phases returns a 409 on the wire.
          This list is platform-declared (source:{" "}
          <code className="font-mono text-[11px]">src/mcp/phase-tool-map.ts</code>) and is the
          same map the MCP server uses for its client-side fast-fail check.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-3 w-3 text-trend-up" aria-hidden />
              Always allowed · {alwaysAllowed.length} verbs
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-xs text-muted-foreground">
            Orientation, navigation, validation, and phase-transition verbs bypass phase checks.{" "}
            <code className="font-mono">invoke_skill</code> is also always-allowed — phase-policing
            for skills happens inside the skill body.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {alwaysAllowed.map((v) => (
              <Badge
                key={v}
                variant="outline"
                className="border-trend-up/30 bg-trend-up/[0.04] font-mono text-[11px] text-foreground/85"
              >
                {v}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Phase-gated · {phaseGated.length} verbs
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="mb-3 text-xs text-muted-foreground">
            Each verb is enabled only in its named phases. A verb absent from this map AND from
            the always-allowed set is denied by default.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Verb
                  </th>
                  {PHASES.map((p) => (
                    <th
                      key={p}
                      className={cn(
                        "px-2 py-2 text-center font-mono text-[10px] font-medium uppercase tracking-[0.08em]",
                        PHASE_TONE[p],
                      )}
                    >
                      {PHASE_LABEL[p]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {phaseGated.map(({ verb, phases }) => (
                  <tr key={verb} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-mono text-[12px] text-foreground/90">
                      {verb}
                    </td>
                    {PHASES.map((p) => (
                      <td key={p} className="px-2 py-1.5 text-center">
                        {phases.has(p) ? (
                          <Check
                            className={cn("mx-auto h-3.5 w-3.5", PHASE_TONE[p])}
                            aria-label={`${verb} allowed in ${p}`}
                          />
                        ) : (
                          <Minus
                            className="mx-auto h-3 w-3 text-muted-foreground/30"
                            aria-label={`${verb} not allowed in ${p}`}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground/70">
        Default denial: any verb absent from both lists fails closed at the route. Update the
        map in <code className="font-mono">src/mcp/phase-tool-map.ts</code> and the MCP server&apos;s
        fast-fail check tracks automatically.
      </p>
    </div>
  );
}
