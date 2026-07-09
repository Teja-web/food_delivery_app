#!/usr/bin/env npx tsx
/**
 * Lint SKILL.md files under src/automations/skills/.
 *
 * Validates:
 *   1. YAML frontmatter parses
 *   2. Frontmatter matches choreography-frontmatter.schema.json
 *   3. Every `coznt.required_verbs` entry exists in the MCP tool registry
 *      (extracted from src/mcp/server.ts)
 *
 * Exit code 0 = clean, 1 = at least one violation.
 *
 * Usage:
 *   pnpm lint:choreographies
 *   pnpm lint:choreographies --warn-missing   # warn instead of fail when a
 *                                              # skill directory has no choreography
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = import.meta.dirname ? join(import.meta.dirname, "..", "..") : process.cwd();
const SKILLS_DIR = join(APP_DIR, "src", "automations", "skills");
const SERVER_TS = join(APP_DIR, "src", "mcp", "server.ts");
const SCHEMA_PATH = join(SKILLS_DIR, "choreography-frontmatter.schema.json");

const warnMissing = process.argv.includes("--warn-missing");

/** Minimal YAML parser — handles the subset we author. Mirrors seed-platform-skills.ts. */
function parseFrontmatter(content: string): { frontmatter: unknown; body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const [, yaml, body] = match;
  const fm: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }

    // Top-level key: value
    const kv = line.match(/^([a-z_-]+):\s*(.*)$/);
    if (!kv) { i++; continue; }
    const [, key, rawValue] = kv;
    const value = rawValue.trim();

    if (value === "") {
      // Nested object or list — scan indented lines
      const nested: Record<string, unknown> = {};
      const list: unknown[] = [];
      let mode: "obj" | "list" | null = null;
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (!next.startsWith("  ")) break;
        const trimmed = next.trim();
        if (!trimmed) { i++; continue; }
        if (trimmed.startsWith("- ")) {
          mode = "list";
          list.push(parseScalar(trimmed.slice(2).trim()));
        } else {
          mode = "obj";
          const sub = trimmed.match(/^([a-z_-]+):\s*(.*)$/);
          if (sub) {
            const [, subKey, subRaw] = sub;
            const subVal = subRaw.trim();
            if (subVal === "") {
              // Nested list under a sub-key
              const subList: unknown[] = [];
              i++;
              while (i < lines.length) {
                const sl = lines[i];
                if (!sl.startsWith("    -")) break;
                subList.push(parseScalar(sl.replace(/^    -\s*/, "").trim()));
                i++;
              }
              nested[subKey] = subList;
              continue;
            } else {
              nested[subKey] = parseScalar(subVal);
            }
          }
        }
        i++;
      }
      fm[key] = mode === "list" ? list : nested;
      continue;
    }

    fm[key] = parseScalar(value);
    i++;
  }
  return { frontmatter: fm, body };
}

function parseScalar(s: string): unknown {
  if (s.startsWith("[") && s.endsWith("]")) {
    return s.slice(1, -1).split(",").map((x) => parseScalar(x.trim())).filter((x) => x !== "");
  }
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  if (s === "true") return true;
  if (s === "false") return false;
  return s;
}

/** Extract registered MCP tool names from src/mcp/server.ts. */
function loadMcpToolNames(): Set<string> {
  const src = readFileSync(SERVER_TS, "utf-8");
  const names = new Set<string>();
  const re = /name:\s*"([a-z_][a-z0-9_]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    names.add(m[1]);
  }
  return names;
}

/** Validate frontmatter against the JSON Schema. Minimal hand-rolled validator. */
function validateFrontmatter(fm: unknown): string[] {
  const errors: string[] = [];
  if (!fm || typeof fm !== "object") return ["frontmatter is not an object"];
  const f = fm as Record<string, unknown>;
  if (typeof f.name !== "string" || f.name.length < 1) errors.push("`name` must be a non-empty string");
  if (typeof f.description !== "string" || f.description.length < 10) {
    errors.push("`description` must be a string of length >= 10");
  }
  if (!f.coznt || typeof f.coznt !== "object") {
    errors.push("`coznt` block missing");
    return errors;
  }
  const c = f.coznt as Record<string, unknown>;
  if (typeof c.version !== "string" || !/^\d+\.\d+\.\d+$/.test(c.version)) {
    errors.push("`coznt.version` must match semver (x.y.z)");
  }
  if (!Array.isArray(c.required_verbs) || c.required_verbs.length === 0) {
    errors.push("`coznt.required_verbs` must be a non-empty array");
  }
  if (c.min_autonomy !== undefined) {
    const allowed = ["observe", "propose", "merge", "lead"];
    if (typeof c.min_autonomy !== "string" || !allowed.includes(c.min_autonomy)) {
      errors.push(
        `\`coznt.min_autonomy\` must be one of ${allowed.join(" | ")} (string form). Integer form is deprecated.`,
      );
    }
  }
  if (c.triggers !== undefined && !Array.isArray(c.triggers)) {
    errors.push("`coznt.triggers` must be an array if present");
  }
  return errors;
}

function main(): void {
  let entries: string[] = [];
  try {
    entries = readdirSync(SKILLS_DIR).filter((name) => {
      const full = join(SKILLS_DIR, name);
      return statSync(full).isDirectory();
    });
  } catch {
    console.error(`Skills directory not found: ${SKILLS_DIR}`);
    process.exit(1);
  }

  const toolNames = loadMcpToolNames();
  console.log(`Loaded ${toolNames.size} MCP tool names from src/mcp/server.ts`);

  let totalChecked = 0;
  let totalErrors = 0;
  let totalMissing = 0;

  for (const slug of entries) {
    const choreoPath = join(SKILLS_DIR, slug, "SKILL.md");
    let content: string;
    try {
      content = readFileSync(choreoPath, "utf-8");
    } catch {
      const msg = `[missing] ${slug}/SKILL.md`;
      if (warnMissing) console.warn(`WARN  ${msg}`);
      else { console.error(`ERROR ${msg}`); totalMissing++; }
      continue;
    }
    totalChecked++;

    const parsed = parseFrontmatter(content);
    if (!parsed) {
      console.error(`ERROR [${slug}] frontmatter delimiter (---) not found`);
      totalErrors++;
      continue;
    }

    const fmErrors = validateFrontmatter(parsed.frontmatter);
    if (fmErrors.length > 0) {
      for (const e of fmErrors) console.error(`ERROR [${slug}] ${e}`);
      totalErrors += fmErrors.length;
    }

    const fm = parsed.frontmatter as Record<string, unknown>;
    const coznt = fm.coznt as Record<string, unknown> | undefined;
    const verbs = (coznt?.required_verbs as string[] | undefined) ?? [];
    for (const verb of verbs) {
      if (!toolNames.has(verb)) {
        console.error(`ERROR [${slug}] required_verbs entry '${verb}' is not a registered MCP tool`);
        totalErrors++;
      }
    }

    if (fmErrors.length === 0 && verbs.every((v) => toolNames.has(v))) {
      console.log(`OK    ${slug} (${verbs.length} verbs)`);
    }
  }

  console.log("");
  console.log(`Summary: ${totalChecked} choreographies checked, ${totalErrors} errors, ${totalMissing} missing.`);
  process.exit(totalErrors + (warnMissing ? 0 : totalMissing) > 0 ? 1 : 0);
}

main();
