#!/usr/bin/env npx tsx
/**
 * Seed platform-authored skills into an organization.
 *
 * Reads every `src/automations/skills/<slug>/SKILL.md` file, parses YAML
 * frontmatter for metadata, and upserts a row into `coznt.skills` with
 * `organization_id = <target>`, `project_id = NULL` (org-wide), and
 * `tags` including `"platform"`. Idempotent: re-running updates the body
 * + metadata in place by `(organization_id, slug)`.
 *
 * Target org resolution:
 *   1. Explicit `seedPlatformSkills(orgId)` arg (used by bootstrap-org.ts
 *      and the web signup hook so new orgs inherit platform skills).
 *   2. `COZNT_SEED_ORG_ID` env var.
 *   3. `COZNT_SEED_ORG_SLUG` env var (resolved via `auth.organization`).
 *   4. Fallback: `slug = 'default'` (db-setup's first-install behavior).
 *
 * Usage:
 *   pnpm tsx scripts/seed-platform-skills.ts                      # default org
 *   COZNT_SEED_ORG_SLUG=acme pnpm tsx scripts/seed-platform-skills.ts
 *
 * Also runs as a step inside `scripts/db-setup.ts` and `bootstrap-org.ts`.
 */

import "dotenv/config";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

const APP_DIR = import.meta.dirname ? join(import.meta.dirname, "..") : process.cwd();
const SKILLS_DIR = join(APP_DIR, "src", "automations", "skills");

const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://postgres:password@localhost:5432/coznt";

type Frontmatter = {
  name?: string;
  description?: string;
  version?: number;
  tags?: string[];
  plan_kind?: string;
};

type SkillFile = {
  slug: string;
  frontmatter: Frontmatter;
  body: string;
};

/**
 * Minimal YAML frontmatter parser — handles the subset we author: string
 * keys, string/number values, and `[a, b, c]` flow-style arrays. Avoids
 * pulling in `js-yaml` for a 7-file seed script.
 */
function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const [, yaml, body] = match;
  const fm: Frontmatter = {};

  for (const line of yaml.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.+)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    const value = rawValue.trim();
    if (key === "tags") {
      const arrMatch = value.match(/^\[(.*)\]$/);
      if (arrMatch) {
        fm.tags = arrMatch[1]
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      }
    } else if (key === "version") {
      fm.version = Number(value);
    } else if (key === "name" || key === "description" || key === "plan_kind") {
      fm[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  return { frontmatter: fm, body: body.trim() };
}

async function resolveTargetOrgId(
  pool: import("pg").Pool,
  explicit?: string,
): Promise<string> {
  if (explicit) return explicit;
  const envOrgId = process.env.COZNT_SEED_ORG_ID;
  if (envOrgId) return envOrgId;
  const slug = process.env.COZNT_SEED_ORG_SLUG ?? "default";
  const res = await pool.query(
    `SELECT id FROM auth.organization WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  const orgId = res.rows[0]?.id;
  if (!orgId) {
    throw new Error(
      `Organization with slug='${slug}' not found. ` +
        `Either run db-setup first, or pass an explicit orgId, or set COZNT_SEED_ORG_SLUG/COZNT_SEED_ORG_ID.`,
    );
  }
  return orgId;
}

function loadSkillFiles(): SkillFile[] {
  const entries = readdirSync(SKILLS_DIR).filter((name) => {
    const path = join(SKILLS_DIR, name);
    return statSync(path).isDirectory();
  });

  return entries.map((slug) => {
    const skillPath = join(SKILLS_DIR, slug, "SKILL.md");
    const content = readFileSync(skillPath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);
    return { slug, frontmatter, body };
  });
}

/**
 * @param targetOrgId Explicit org id to seed into. When omitted, falls back
 *   to `COZNT_SEED_ORG_ID`, then `COZNT_SEED_ORG_SLUG`, then `slug='default'`.
 */
export async function seedPlatformSkills(
  targetOrgId?: string,
): Promise<{ inserted: number; updated: number; orgId: string }> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: DATABASE_URL });

  let inserted = 0;
  let updated = 0;

  try {
    const orgId = await resolveTargetOrgId(pool, targetOrgId);

    const files = loadSkillFiles();
    if (files.length === 0) {
      console.log("  - No platform-skill directories found under src/automations/skills/");
      return { inserted: 0, updated: 0, orgId };
    }

    for (const file of files) {
      const { slug, frontmatter, body } = file;
      const name = frontmatter.name || slug;
      const description = frontmatter.description || null;
      const tags = Array.from(new Set(["platform", ...(frontmatter.tags || [])]));

      const existing = await pool.query(
        `SELECT id FROM coznt.skills WHERE organization_id = $1 AND slug = $2 AND project_id IS NULL LIMIT 1`,
        [orgId, slug],
      );

      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE coznt.skills
             SET name = $1, description = $2, body = $3, tags = $4, enabled = true, updated_at = NOW()
           WHERE id = $5`,
          [name, description, body, tags, existing.rows[0].id],
        );
        updated++;
        console.log(`  ~ ${slug} (updated)`);
      } else {
        const id = `sk_${randomBytes(10).toString("hex")}`;
        await pool.query(
          `INSERT INTO coznt.skills
             (id, organization_id, project_id, slug, name, description, body, tags, enabled, created_at, updated_at)
           VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, true, NOW(), NOW())`,
          [id, orgId, slug, name, description, body, tags],
        );
        inserted++;
        console.log(`  + ${slug}`);
      }
    }
    return { inserted, updated, orgId };
  } finally {
    await pool.end();
  }
}

// Standalone CLI entry — only runs when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedPlatformSkills()
    .then(({ inserted, updated, orgId }) => {
      console.log(
        `\n+ Platform skills seeded into org ${orgId}: ${inserted} inserted, ${updated} updated`,
      );
    })
    .catch((error) => {
      console.error("\nSeeding failed:", error.message);
      process.exit(1);
    });
}
