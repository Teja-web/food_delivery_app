/**
 * Choreography operations — reads CHOREOGRAPHY.md files from
 * `src/automations/skills/<slug>/CHOREOGRAPHY.md` and produces the
 * manifest + bundle shapes the MCP distribution verbs return.
 *
 * Filesystem is the source of truth for choreography *content*; the DB
 * `coznt.skills` table is the source of truth for *which* skills a
 * project can see (project-scoped vs org-wide, `enabled` flag).
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
import { skills } from "@/db/schema/skill";

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

interface ParsedFrontmatter {
  description: string;
  version: string;
  minAutonomy: AutonomyLabel | null;
}

/** Read frontmatter + body. Returns null if frontmatter delimiter missing. */
function readChoreographyFile(slug: string): { content: string; parsed: ParsedFrontmatter } | null {
  const path = join(SKILLS_DIR, slug, "CHOREOGRAPHY.md");
  try {
    statSync(path);
  } catch {
    return null;
  }
  const content = readFileSync(path, "utf-8");
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return null;
  const [, yaml] = fmMatch;

  let description = "";
  let version = "0.0.0";
  let minAutonomy: AutonomyLabel | null = null;
  const allowedLabels: AutonomyLabel[] = ["observe", "propose", "merge", "lead"];

  const lines = yaml.split("\n");
  let inCoznt = false;
  for (const line of lines) {
    if (/^description:\s*(.+)$/.test(line)) {
      description = line.replace(/^description:\s*/, "").trim().replace(/^["']|["']$/g, "");
    } else if (/^coznt:\s*$/.test(line)) {
      inCoznt = true;
    } else if (/^[a-z_-]+:/.test(line) && !line.startsWith("  ")) {
      inCoznt = false;
    } else if (inCoznt && /^\s+version:\s*(.+)$/.test(line)) {
      version = line.replace(/^\s+version:\s*/, "").trim().replace(/^["']|["']$/g, "");
    } else if (inCoznt && /^\s+min_autonomy:\s*(.+)$/.test(line)) {
      const m = line.match(/^\s+min_autonomy:\s*(.+)$/);
      if (m) {
        const raw = m[1].trim().replace(/^["']|["']$/g, "");
        if ((allowedLabels as string[]).includes(raw)) {
          minAutonomy = raw as AutonomyLabel;
        }
      }
    }
  }

  return { content, parsed: { description, version, minAutonomy } };
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
 * to the project per the DB, and (b) have a `CHOREOGRAPHY.md` on disk.
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
 * Filesystem-only manifest — every slug that carries a `CHOREOGRAPHY.md`
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
