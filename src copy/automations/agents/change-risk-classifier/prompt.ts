/**
 * Prompt for the change-risk-classifier agent.
 *
 * The system prompt is intentionally short. Context is injected via
 * `changeRiskClassifierPromptWithContext` so each call carries only the
 * project metadata, critical-path globs, and the file-level diff summary
 * relevant to *this* PR.
 */

export const changeRiskClassifierPrompt = `You are a senior staff engineer reviewing a pull request for merge risk.

Classify the change into one of four risk levels:

- **low** — minor edits to non-critical code (docs, tests, internal tooling), no production paths touched, small diff.
- **medium** — meaningful logic changes inside a normal service path, or large diffs (>200 lines) that don't touch critical infrastructure.
- **high** — touches production-critical paths (auth, payments, data plane, schema migrations), OR large diffs across multiple services.
- **critical** — would take down a tier-0 surface if it ships broken: irreversible migrations, secret rotation, public API contract breaks, root-credential changes.

Be conservative — when in doubt, escalate. Cite specific files, line counts, or path globs in your rationale. Don't speculate beyond what the diff shows.

Output STRICT JSON matching the provided schema. No prose outside the JSON.`;

export interface ChangeRiskPromptContext {
  projectName: string;
  projectPhase: string;
  prTitle: string;
  prRef: string;
  prBody?: string | null;
  /** Stringified file list: `<filename>\t+<adds> -<dels>` per line. */
  fileSummary: string;
  totalLines: number;
  criticalPaths: string[];
  productionCriticalPaths: string[];
  heuristicRisk: string;
  /** Slugs of active project rules at error severity. */
  activeRules: string[];
}

export function changeRiskClassifierPromptWithContext(ctx: ChangeRiskPromptContext): string {
  const ruleLine = ctx.activeRules.length > 0 ? ctx.activeRules.join(", ") : "(none active)";
  const critLine = ctx.criticalPaths.length > 0 ? ctx.criticalPaths.join(", ") : "(none)";
  const prodCritLine = ctx.productionCriticalPaths.length > 0 ? ctx.productionCriticalPaths.join(", ") : "(none)";
  const body = (ctx.prBody ?? "").slice(0, 800);

  return [
    `## PROJECT: ${ctx.projectName} (phase: ${ctx.projectPhase})`,
    `## PR: ${ctx.prRef} — ${ctx.prTitle}`,
    body ? `## PR DESCRIPTION (first 800 chars):\n${body}` : "",
    `## CRITICAL PATHS: ${critLine}`,
    `## PRODUCTION-CRITICAL PATHS: ${prodCritLine}`,
    `## ACTIVE RULES (error severity): ${ruleLine}`,
    `## HEURISTIC FIRST PASS: ${ctx.heuristicRisk} (${ctx.totalLines} lines changed)`,
    `## FILES:`,
    ctx.fileSummary || "(no file metadata available)",
    ``,
    `Classify the risk, cite signals, and recommend gates. Return JSON.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
