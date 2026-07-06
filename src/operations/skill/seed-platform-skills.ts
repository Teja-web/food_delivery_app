import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { skills } from "@/db/schema";

type Frontmatter = {
  name?: string;
  description?: string;
  tags?: string[];
};

const PLATFORM_SKILL_SLUGS = [
  "adr-extractor",
  "cicd-pipeline-authoring",
  "dev-summary-generator",
  "epic-decomposer",
  "feature-spec-generator",
  "go-live-report-generator",
  "incident-postmortem",
  "project-lifecycle",
  "release-notes-generator",
  "requirements-document",
  "storyboard-generator",
  "test-execution-report-generator",
  "test-plan-generator",
] as const;

function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content.trim() };

  const [, yaml, body] = match;
  const frontmatter: Frontmatter = {};
  for (const line of yaml.split("\n")) {
    const entry = line.match(/^([a-z_]+):\s*(.+)$/);
    if (!entry) continue;
    const [, key, rawValue] = entry;
    const value = rawValue.trim();
    if (key === "tags") {
      const arrMatch = value.match(/^\[(.*)\]$/);
      if (arrMatch) {
        frontmatter.tags = arrMatch[1]
          .split(",")
          .map((item) => item.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      }
    } else if (key === "name" || key === "description") {
      frontmatter[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  return { frontmatter, body: body.trim() };
}

export async function seedPlatformSkillsForOrganization(
  organizationId: string,
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const slug of PLATFORM_SKILL_SLUGS) {
    const skillPath = join(process.cwd(), "src", "automations", "skills", slug, "SKILL.md");
    const content = await readFile(skillPath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);
    const name = frontmatter.name || slug;
    const description = frontmatter.description || null;
    const tags = Array.from(new Set(["platform", ...(frontmatter.tags || [])]));

    const existing = await db.query.skills.findFirst({
      where: and(
        eq(skills.organizationId, organizationId),
        eq(skills.slug, slug),
        isNull(skills.projectId),
      ),
    });

    if (existing) {
      await db
        .update(skills)
        .set({
          name,
          description,
          body,
          tags,
          enabled: true,
          updatedAt: new Date(),
        })
        .where(eq(skills.id, existing.id));
      updated += 1;
    } else {
      await db.insert(skills).values({
        id: `sk_${randomBytes(10).toString("hex")}`,
        organizationId,
        projectId: null,
        slug,
        name,
        description,
        body,
        tags,
        enabled: true,
      });
      inserted += 1;
    }
  }

  return { inserted, updated };
}
