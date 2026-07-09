/**
 * Change-risk heuristic for execution-gate input. See
 * `docs/execution-gate-plan.md` for the policy this implements.
 *
 *   low    — diff < 50 lines AND no critical_paths matched
 *   medium — diff 50-500 lines OR critical_paths matched AND diff < 200
 *   high   — diff > 500 lines OR production_critical_paths matched
 *
 * Path matching is glob-style with two supported forms:
 *   - `prefix/` (trailing slash) — matches anything starting with prefix
 *   - `pattern` (no slash, contains `*`) — converted to a regex with
 *     `*` → `[^/]*` and `**` → `.*`
 *   - `pattern` (no glob) — exact match
 */

export const CHANGE_RISKS = ["low", "medium", "high", "critical"] as const;
export type ChangeRisk = (typeof CHANGE_RISKS)[number];

export interface ChangedFile {
  filename: string;
  additions: number;
  deletions: number;
}

export interface ChangeRiskInput {
  files: ChangedFile[];
  criticalPaths: string[];
  productionCriticalPaths: string[];
}

export interface ChangeRiskResult {
  risk: ChangeRisk;
  totalLines: number;
  criticalHits: string[];
  productionCriticalHits: string[];
}

function globToRegExp(pattern: string): RegExp {
  if (pattern.endsWith("/")) {
    const prefix = pattern.replace(/\/$/, "");
    return new RegExp(`^${escapeRegex(prefix)}/`);
  }
  if (pattern.includes("*")) {
    const re = escapeRegex(pattern)
      .replace(/\\\*\\\*/g, ".*")
      .replace(/\\\*/g, "[^/]*");
    return new RegExp(`^${re}$`);
  }
  return new RegExp(`^${escapeRegex(pattern)}$`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function matchesAny(filename: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (globToRegExp(p).test(filename)) return true;
  }
  return false;
}

export function classifyChangeRisk(input: ChangeRiskInput): ChangeRiskResult {
  const totalLines = input.files.reduce((acc, f) => acc + f.additions + f.deletions, 0);

  const criticalHits: string[] = [];
  const productionCriticalHits: string[] = [];
  for (const f of input.files) {
    if (matchesAny(f.filename, input.productionCriticalPaths)) {
      productionCriticalHits.push(f.filename);
    } else if (matchesAny(f.filename, input.criticalPaths)) {
      criticalHits.push(f.filename);
    }
  }

  if (productionCriticalHits.length > 0 || totalLines > 500) {
    return { risk: "high", totalLines, criticalHits, productionCriticalHits };
  }
  if (totalLines >= 50 || (criticalHits.length > 0 && totalLines < 200)) {
    return { risk: "medium", totalLines, criticalHits, productionCriticalHits };
  }
  return { risk: "low", totalLines, criticalHits, productionCriticalHits };
}
