/**
 * Build the published JSON Schema bundle for `.agents/**\/*.md` frontmatter,
 * per docs/spec/dev-authoring-surface.md §17.
 *
 * Output: `public/install/coznt-authoring-schema.json`. Editors (VS Code YAML
 * extension, JetBrains, Helix) point their `yaml.schemas` setting at this URL
 * and discriminate by path:
 *
 *   ".agents/skills/*.md"      → $ref #/$defs/skillFrontmatter
 *   ".agents/rules/*.md"       → $ref #/$defs/ruleFrontmatter
 *   ".agents/plans/**\/*.md"   → $ref #/$defs/planFrontmatter
 *
 * Source of truth is `src/lib/authoring/schemas.ts`. Run via:
 *   pnpm tsx scripts/build/authoring-schema-pack.ts
 *
 * CI should run this on every commit that touches schemas.ts and fail if the
 * published file is stale (same discipline as drizzle migrations).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";

const __dirname = dirname(fileURLToPath(import.meta.url));
import {
  skillFileFrontmatterSchema,
  ruleFileFrontmatterSchema,
  planFileFrontmatterSchema,
} from "../../src/lib/authoring/schemas";

const out = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://coznt.dev/install/coznt-authoring-schema.json",
  title: "Coznt — `.agents/` authoring frontmatter",
  description:
    "Frontmatter shapes for `.agents/skills/*.md`, `.agents/rules/*.md`, and `.agents/plans/<kind>/*.md`. Generated from src/lib/authoring/schemas.ts.",
  $defs: {
    skillFrontmatter: z.toJSONSchema(skillFileFrontmatterSchema),
    ruleFrontmatter: z.toJSONSchema(ruleFileFrontmatterSchema),
    planFrontmatter: z.toJSONSchema(planFileFrontmatterSchema),
  },
};

const target = resolve(__dirname, "../../public/install/coznt-authoring-schema.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(out, null, 2) + "\n", "utf8");

const summary = {
  path: target,
  bytes: JSON.stringify(out).length,
  defs: Object.keys(out.$defs),
};
console.log(`coznt-authoring-schema.json written:`, summary);
