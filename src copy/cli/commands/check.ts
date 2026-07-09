/**
 * `coznt check` — local dry-run for `.agents/**\/*.md` authoring artifacts.
 *
 * Per docs/spec/dev-authoring-surface.md §14, this closes the iterate-locally
 * gap: without `coznt check` the dev's only feedback is the PR check-run
 * after push. The command discovers skill / rule / plan files on the current
 * branch, validates frontmatter, and surfaces what would change on merge.
 *
 *   coznt check                  # dry-run dispatch of every applicable skill on the current diff
 *   coznt check --slug foo       # one skill
 *   coznt check --rules          # evaluate rules against current state
 *   coznt check --rules --rule foo
 *   coznt check --plans          # preview status / governance materialization
 *
 * MVP: file-validation + local rule evaluation only. The skill dry-run + the
 * plan governance preview hit the server (planned: separate MCP verb,
 * out of scope for first ship).
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  skillFileFrontmatterSchema,
  ruleFileFrontmatterSchema,
  planFileFrontmatterSchema,
  resolvePlanRelationships,
  type SkillFileFrontmatter,
  type RuleFileFrontmatter,
  type PlanFileFrontmatter,
} from "../../lib/authoring/schemas";
import { parseFrontmatter } from "../../lib/authoring/parse-frontmatter";
import {
  parseCozntConfig,
  resolveAuthoringPaths,
  type ResolvedAuthoringPaths,
} from "../../lib/authoring/coznt-config";
import { PLAN_KINDS, type PlanKind } from "../../db/schema/plan/plan-kinds";

export interface CheckOptions {
  /** Limit to a single skill / rule slug. */
  slug?: string;
  /** Only check rules. */
  rules?: boolean;
  /** Only check plans. */
  plans?: boolean;
  /** Repository root (default: cwd). */
  cwd?: string;
}

export async function runCheck(opts: CheckOptions): Promise<number> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const paths = await loadConfig(cwd);
  const results: CheckReport = {
    skills: [],
    rules: [],
    plans: [],
    errors: [],
  };

  const onlyRules = !!opts.rules;
  const onlyPlans = !!opts.plans;
  const allDimensions = !onlyRules && !onlyPlans;

  if (allDimensions || (!onlyRules && !onlyPlans)) {
    await scanSkills(cwd, paths, results, opts.slug);
  }
  if (onlyRules || allDimensions) {
    await scanRules(cwd, paths, results, opts.slug);
  }
  if (onlyPlans || allDimensions) {
    await scanPlans(cwd, paths, results);
  }

  printReport(results);
  return results.errors.length > 0 ? 1 : 0;
}

interface CheckReport {
  skills: Array<{ path: string; fm: SkillFileFrontmatter }>;
  rules: Array<{ path: string; fm: RuleFileFrontmatter }>;
  plans: Array<{
    path: string;
    kind: PlanKind;
    fm: PlanFileFrontmatter;
    relationships: ReturnType<typeof resolvePlanRelationships>;
  }>;
  errors: Array<{ path: string; message: string }>;
}

async function loadConfig(cwd: string): Promise<ResolvedAuthoringPaths> {
  try {
    const text = await readFile(join(cwd, ".agents/coznt.yaml"), "utf8");
    return resolveAuthoringPaths(parseCozntConfig(text));
  } catch {
    return resolveAuthoringPaths(null);
  }
}

async function listMarkdown(cwd: string, prefix: string): Promise<string[]> {
  const root = join(cwd, prefix);
  try {
    const items = await readdir(root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of items) {
      if (entry.isDirectory()) continue; // MVP: no subdirs (spec §21 open question)
      if (!entry.name.endsWith(".md")) continue;
      if (entry.name === "README.md") continue;
      files.push(join(root, entry.name));
    }
    return files;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function scanSkills(
  cwd: string,
  paths: ResolvedAuthoringPaths,
  report: CheckReport,
  filterSlug: string | undefined,
): Promise<void> {
  const files = await listMarkdown(cwd, paths.skills);
  for (const abs of files) {
    const rel = relative(cwd, abs);
    try {
      const content = await readFile(abs, "utf8");
      const parsed = parseFrontmatter(content, rel);
      const result = skillFileFrontmatterSchema.safeParse(parsed.data);
      if (!result.success) {
        report.errors.push({ path: rel, message: result.error.message });
        continue;
      }
      if (filterSlug && result.data.slug !== filterSlug) continue;
      report.skills.push({ path: rel, fm: result.data });
    } catch (err) {
      report.errors.push({ path: rel, message: (err as Error).message });
    }
  }
}

async function scanRules(
  cwd: string,
  paths: ResolvedAuthoringPaths,
  report: CheckReport,
  filterSlug: string | undefined,
): Promise<void> {
  const files = await listMarkdown(cwd, paths.rules);
  for (const abs of files) {
    const rel = relative(cwd, abs);
    try {
      const content = await readFile(abs, "utf8");
      const parsed = parseFrontmatter(content, rel);
      const result = ruleFileFrontmatterSchema.safeParse(parsed.data);
      if (!result.success) {
        report.errors.push({ path: rel, message: result.error.message });
        continue;
      }
      if (filterSlug && result.data.slug !== filterSlug) continue;
      report.rules.push({ path: rel, fm: result.data });
    } catch (err) {
      report.errors.push({ path: rel, message: (err as Error).message });
    }
  }
}

async function scanPlans(
  cwd: string,
  paths: ResolvedAuthoringPaths,
  report: CheckReport,
): Promise<void> {
  for (const kind of PLAN_KINDS) {
    for (const prefix of paths.plans[kind] ?? []) {
      // Well-known paths require explicit `kind:` in frontmatter; for kind
      // matching the prefix we infer it.
      const requiresKind = !prefix.startsWith(".agents/");
      let exists = true;
      try {
        const s = await stat(join(cwd, prefix));
        exists = s.isDirectory();
      } catch {
        exists = false;
      }
      if (!exists) continue;
      const files = await listMarkdown(cwd, prefix);
      for (const abs of files) {
        const rel = relative(cwd, abs);
        try {
          const content = await readFile(abs, "utf8");
          const parsed = parseFrontmatter(content, rel);
          const rawKind = (parsed.data as { kind?: unknown }).kind;
          const fmKind = typeof rawKind === "string" ? rawKind : undefined;
          if (requiresKind && !fmKind) continue;
          const dataWithKind = { ...parsed.data, kind: fmKind ?? kind };
          const result = planFileFrontmatterSchema.safeParse(dataWithKind);
          if (!result.success) {
            report.errors.push({ path: rel, message: result.error.message });
            continue;
          }
          report.plans.push({
            path: rel,
            kind: (fmKind ?? kind) as PlanKind,
            fm: result.data,
            relationships: resolvePlanRelationships(result.data),
          });
        } catch (err) {
          report.errors.push({ path: rel, message: (err as Error).message });
        }
      }
    }
  }
}

function printReport(report: CheckReport): void {
  if (report.skills.length === 0 && report.rules.length === 0 && report.plans.length === 0) {
    console.log("No .agents/ authoring artifacts found in current branch.");
  }

  if (report.skills.length > 0) {
    console.log(`\nSkills (${report.skills.length}):`);
    for (const s of report.skills) {
      const level = s.fm.requiredLevel ?? 0;
      const risk = s.fm.riskClass ?? "medium";
      const triggers = s.fm.triggers?.length ?? 0;
      console.log(
        `  ✓ ${s.path} — ${s.fm.slug} (level ${level}, risk=${risk}, triggers=${triggers})`,
      );
    }
  }

  if (report.rules.length > 0) {
    console.log(`\nRules (${report.rules.length}):`);
    for (const r of report.rules) {
      const sev = r.fm.severity ?? "warn";
      console.log(`  ✓ ${r.path} — ${r.fm.slug} (${r.fm.validator}, severity=${sev})`);
    }
  }

  if (report.plans.length > 0) {
    console.log(`\nPlans (${report.plans.length}):`);
    for (const p of report.plans) {
      const rels = p.relationships.length > 0
        ? ` rels=${p.relationships.map((r) => `${r.kind}→${r.target}`).join(",")}`
        : "";
      console.log(`  ✓ ${p.path} — ${p.kind}:${p.fm.slug}${rels}`);
    }
  }

  if (report.errors.length > 0) {
    console.log(`\nErrors (${report.errors.length}):`);
    for (const e of report.errors) {
      console.log(`  ✗ ${e.path}: ${e.message}`);
    }
  } else if (report.skills.length + report.rules.length + report.plans.length > 0) {
    console.log("\nAll artifacts pass frontmatter validation.");
  }
}
