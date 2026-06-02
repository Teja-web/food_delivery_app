/**
 * Choreography operations — reads SKILL.md files from
 * `src/automations/skills/<slug>/SKILL.md` and produces the manifest +
 * bundle shapes the MCP distribution verbs return.
 *
 * Filesystem is the source of truth for choreography *content*; the DB
 * `coznt.skills` table is the source of truth for *which* skills a
 * project can see (project-scoped vs org-wide, `enabled` flag).
 *
 * Each skill has ONE file (`SKILL.md`) — both the DB seed metadata
 * (tags / plan_kind / version) and the editor-facing workflow guide
 * (description / coznt block / body) live in its frontmatter + body.
 * The previously-separate `SKILL.md` was collapsed into SKILL.md
 * to remove the dual-source confusion that let `name:` drift between
 * them.
 *
 * Used by:
 *   - `/api/v1/mcp/choreographies` (GET → manifest)
 *   - `/api/v1/mcp/choreographies/sync` (POST → bundle)
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/db/client";
import { customChoreographies } from "@/db/schema/custom-choreography";
import { skills } from "@/db/schema/skill/skill";

const APP_DIR = process.cwd();
const SKILLS_DIR = join(APP_DIR, "src", "automations", "skills");

export interface ChoreographyManifestEntry {
  slug: string;
  version: string;
  hash: string;
  description: string;
  minAutonomy: "observe" | "propose" | "merge" | "lead" | null;
}

export interface ChoreographyManifest {
  choreographies: ChoreographyManifestEntry[];
  manifestHash: string;
}

export interface ChoreographyBundleEntry extends ChoreographyManifestEntry {
  content: string;
}

export interface CustomChoreographyBundleEntry extends ChoreographyBundleEntry {
  /** "org" or "project" — distinguishes scope of the customer-authored row. */
  scope: "org" | "project";
}

export interface ChoreographyBundle {
  /** Platform-shipped choreographies (filesystem). */
  choreographies: ChoreographyBundleEntry[];
  /** Customer-authored choreographies (DB-stored). */
  custom: CustomChoreographyBundleEntry[];
  manifestHash: string;
}

interface SkillRow {
  slug: string;
  enabled: boolean;
  projectId: string | null;
}

type AutonomyLabel = "observe" | "propose" | "merge" | "lead";

/**
 * One routing rule. `phase` + `state` are matched against project data
 * by the recommendedKickoff resolver; the first matching rule wins.
 * State names are closed (see resolveKickoffState in
 * src/lib/agent-context/recommended-kickoff.ts) — unknown states never match.
 */
export interface ChoreographyRoutingRule {
  phase: string;
  state: string;
  kickoff: string;
  rationale: string;
}

interface ParsedFrontmatter {
  description: string;
  version: string;
  minAutonomy: AutonomyLabel | null;
  routing: ChoreographyRoutingRule[];
}

const STRIP_QUOTES = (s: string) => s.trim().replace(/^["']|["']$/g, "");

/**
 * Parse the body of a markdown YAML frontmatter block. Hand-rolled to
 * avoid pulling in a YAML dep — supports the subset coznt choreographies
 * actually use:
 *   description: <string>
 *   coznt:
 *     version: <string>
 *     min_autonomy: <label>
 *     routing:
 *       - phase: <string>
 *         state: <string>
 *         kickoff: <string>
 *         rationale: <string>
 */
function parseFrontmatter(yaml: string): ParsedFrontmatter {
  let description = "";
  let version = "0.0.0";
  let minAutonomy: AutonomyLabel | null = null;
  const routing: ChoreographyRoutingRule[] = [];
  const allowedLabels: AutonomyLabel[] = ["observe", "propose", "merge", "lead"];

  let inCoznt = false;
  let inRouting = false;
  let currentRule: Partial<ChoreographyRoutingRule> | null = null;

  const commitRule = () => {
    if (
      currentRule &&
      currentRule.phase &&
      currentRule.state &&
      currentRule.kickoff !== undefined &&
      currentRule.rationale !== undefined
    ) {
      routing.push(currentRule as ChoreographyRoutingRule);
    }
    currentRule = null;
  };

  for (const line of yaml.split("\n")) {
    // Top-level key (column 0) ends any active nested context.
    if (/^[a-z_-]+:/.test(line) && !line.startsWith(" ")) {
      commitRule();
      inRouting = false;
      inCoznt = /^coznt:\s*$/.test(line);
      const descMatch = line.match(/^description:\s*(.+)$/);
      if (descMatch) description = STRIP_QUOTES(descMatch[1]);
      continue;
    }

    if (!inCoznt) continue;

    // Inside `coznt:` block.
    const verMatch = line.match(/^\s+version:\s*(.+)$/);
    if (verMatch && !inRouting) {
      version = STRIP_QUOTES(verMatch[1]);
      continue;
    }
    const autMatch = line.match(/^\s+min_autonomy:\s*(.+)$/);
    if (autMatch && !inRouting) {
      const raw = STRIP_QUOTES(autMatch[1]);
      if ((allowedLabels as string[]).includes(raw)) {
        minAutonomy = raw as AutonomyLabel;
      }
      continue;
    }
    if (/^\s+routing:\s*$/.test(line)) {
      inRouting = true;
      continue;
    }
    if (!inRouting) continue;

    // Inside `routing:` array. New rule starts on `- phase: <value>`.
    const newRule = line.match(/^\s+-\s+phase:\s*(.+)$/);
    if (newRule) {
      commitRule();
      currentRule = { phase: STRIP_QUOTES(newRule[1]) };
      continue;
    }
    if (!currentRule) continue;

    const stateMatch = line.match(/^\s+state:\s*(.+)$/);
    if (stateMatch) {
      currentRule.state = STRIP_QUOTES(stateMatch[1]);
      continue;
    }
    const kickoffMatch = line.match(/^\s+kickoff:\s*(.+)$/);
    if (kickoffMatch) {
      currentRule.kickoff = STRIP_QUOTES(kickoffMatch[1]);
      continue;
    }
    const ratMatch = line.match(/^\s+rationale:\s*(.+)$/);
    if (ratMatch) {
      currentRule.rationale = STRIP_QUOTES(ratMatch[1]);
      continue;
    }
  }
  commitRule();

  return { description, version, minAutonomy, routing };
}

/** Read frontmatter + body from SKILL.md. Returns null if missing or malformed. */
function readChoreographyFile(slug: string): { content: string; parsed: ParsedFrontmatter } | null {
  const path = join(SKILLS_DIR, slug, "SKILL.md");
  try {
    statSync(path);
  } catch {
    return null;
  }
  const content = readFileSync(path, "utf-8");
  return readChoreographyContent(content);
}

/**
 * Parse a raw SKILL.md string (frontmatter + body). Exposed so
 * custom-choreography rows (stored as text in the DB, not on disk) can
 * be parsed via the same pipeline as platform files.
 */
export function readChoreographyContent(
  content: string,
): { content: string; parsed: ParsedFrontmatter } | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return null;
  return { content, parsed: parseFrontmatter(fmMatch[1]) };
}

/**
 * Return the routing rules for a given slug. Prefers a custom row
 * (project-scoped > org-wide); falls back to the platform file. Returns
 * an empty array if no source carries routing.
 *
 * Used by the recommendedKickoff resolver. Project-mediated lookup so
 * org and project overrides flow without a platform redeploy.
 */
export async function getRoutingRulesForSlug(
  organizationId: string,
  projectId: string,
  slug: string,
): Promise<{ rules: ChoreographyRoutingRule[]; source: "choreography_custom_project" | "choreography_custom_org" | "choreography_default" | "none" }> {
  const customRows = await db
    .select()
    .from(customChoreographies)
    .where(
      and(
        eq(customChoreographies.organizationId, organizationId),
        eq(customChoreographies.slug, slug),
        eq(customChoreographies.enabled, true),
        isNull(customChoreographies.deletedAt),
        or(
          eq(customChoreographies.projectId, projectId),
          isNull(customChoreographies.projectId),
        ),
      ),
    );

  // Project-scoped wins over org-wide.
  const projectCustom = customRows.find((r) => r.projectId === projectId);
  const orgCustom = customRows.find((r) => r.projectId === null);

  for (const [row, source] of [
    [projectCustom, "choreography_custom_project"] as const,
    [orgCustom, "choreography_custom_org"] as const,
  ]) {
    if (!row) continue;
    const parsed = readChoreographyContent(row.body);
    if (parsed && parsed.parsed.routing.length > 0) {
      return { rules: parsed.parsed.routing, source };
    }
  }

  const platform = readChoreographyFile(slug);
  if (platform && platform.parsed.routing.length > 0) {
    return { rules: platform.parsed.routing, source: "choreography_default" };
  }

  return { rules: [], source: "none" };
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

/** Compute the deterministic manifest hash from sorted slug:hash pairs. */
function computeManifestHash(entries: { slug: string; hash: string }[]): string {
  const sorted = [...entries].sort((a, b) => a.slug.localeCompare(b.slug));
  const canonical = sorted.map((e) => `${e.slug}:${e.hash}`).join("\n");
  return sha256(canonical);
}

/** Find the skill rows that are enabled and visible to this project. */
async function loadVisibleSkills(organizationId: string, projectId: string): Promise<SkillRow[]> {
  const rows = await db
    .select({
      slug: skills.slug,
      enabled: skills.enabled,
      projectId: skills.projectId,
    })
    .from(skills)
    .where(
      and(
        eq(skills.organizationId, organizationId),
        eq(skills.enabled, true),
        or(eq(skills.projectId, projectId), isNull(skills.projectId)),
      ),
    );
  return rows;
}

/**
 * List the choreography manifest for a project. Reads from the
 * filesystem; only includes skills that (a) are enabled and visible
 * to the project per the DB, and (b) have a `SKILL.md` on disk.
 */
export async function listChoreographies(
  organizationId: string,
  projectId: string,
): Promise<ChoreographyManifest> {
  const visible = await loadVisibleSkills(organizationId, projectId);
  const entries: ChoreographyManifestEntry[] = [];

  for (const skill of visible) {
    const file = readChoreographyFile(skill.slug);
    if (!file) continue;
    const hash = sha256(file.content);
    entries.push({
      slug: skill.slug,
      version: file.parsed.version,
      hash,
      description: file.parsed.description,
      minAutonomy: file.parsed.minAutonomy,
    });
  }

  entries.sort((a, b) => a.slug.localeCompare(b.slug));
  const manifestHash = computeManifestHash(entries);
  return { choreographies: entries, manifestHash };
}

/**
 * Return the full content bundle for a project's choreographies. If
 * `slugs` is provided, only those entries are returned, in the order
 * requested. Unknown slugs throw.
 */
/**
 * Filesystem-only manifest — every slug that carries a `SKILL.md`
 * regardless of org / project / enabled state. Used by the skill catalog
 * UI to indicate "this skill has a choreography file" without needing a
 * project-scoped MCP call.
 */
export function listAllChoreographyFiles(): Map<string, ChoreographyManifestEntry> {
  const result = new Map<string, ChoreographyManifestEntry>();
  let entries: string[];
  try {
    entries = readdirSync(SKILLS_DIR);
  } catch {
    return result;
  }
  for (const slug of entries) {
    try {
      const stat = statSync(join(SKILLS_DIR, slug));
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }
    const file = readChoreographyFile(slug);
    if (!file) continue;
    result.set(slug, {
      slug,
      version: file.parsed.version,
      hash: sha256(file.content),
      description: file.parsed.description,
      minAutonomy: file.parsed.minAutonomy,
    });
  }
  return result;
}

/**
 * Read the raw body of a single choreography file. Returns null when
 * the file is missing. Used by the skill detail page to render the
 * pushed workflow guide alongside the server-side prompt.
 */
export function readChoreographyBody(slug: string): string | null {
  const file = readChoreographyFile(slug);
  return file ? file.content : null;
}

export async function getChoreographyBundle(
  organizationId: string,
  projectId: string,
  slugs?: string[],
): Promise<ChoreographyBundle> {
  const manifest = await listChoreographies(organizationId, projectId);
  const byslug = new Map(manifest.choreographies.map((c) => [c.slug, c]));

  let order: string[];
  if (slugs && slugs.length > 0) {
    for (const s of slugs) {
      if (!byslug.has(s)) {
        throw new Error(`Unknown choreography slug: ${s}`);
      }
    }
    order = slugs;
  } else {
    order = manifest.choreographies.map((c) => c.slug);
  }

  const bundle: ChoreographyBundleEntry[] = [];
  for (const slug of order) {
    const entry = byslug.get(slug)!;
    const file = readChoreographyFile(slug);
    if (!file) {
      // Should not happen — listChoreographies already filtered to entries with files
      throw new Error(`Choreography file disappeared between manifest and bundle for ${slug}`);
    }
    bundle.push({ ...entry, content: file.content });
  }

  // Customer-authored choreographies — DB-stored, separate sub-bundle.
  // Listed alongside platform entries so the CLI can route them to a
  // distinct subdirectory in the dev's repo.
  const custom = await loadCustomBundle(organizationId, projectId);

  return {
    choreographies: bundle,
    custom,
    manifestHash: manifest.manifestHash,
  };
}

async function loadCustomBundle(
  organizationId: string,
  projectId: string,
): Promise<CustomChoreographyBundleEntry[]> {
  const { listCustomChoreographies } = await import("./custom-choreographies");
  // Reuse the operation but bypass the action-context check by going
  // direct to the DB filter — server-side composition for the manifest path.
  const rows = await db
    .select()
    .from(customChoreographies)
    .where(
      and(
        eq(customChoreographies.organizationId, organizationId),
        eq(customChoreographies.enabled, true),
        isNull(customChoreographies.deletedAt),
        or(
          eq(customChoreographies.projectId, projectId),
          isNull(customChoreographies.projectId),
        ),
      ),
    );
  return rows.map((r) => ({
    slug: r.slug,
    version: r.version,
    hash: sha256(r.body),
    description: r.name,
    minAutonomy: null,
    content: r.body,
    scope: (r.projectId ? "project" : "org") as "project" | "org",
  }));
  // listCustomChoreographies is also used by the UI; kept inline here to
  // avoid requiring an active actor context.
  void listCustomChoreographies;
}
