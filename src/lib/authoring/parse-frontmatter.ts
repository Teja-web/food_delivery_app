/**
 * Parse a markdown file with YAML frontmatter.
 *
 * Used by the merge-webhook sync tasks and the `coznt check` CLI to extract
 * structured authoring config from `.agents/skills/*.md`,
 * `.agents/rules/*.md`, and `.agents/plans/<kind>/*.md` files per
 * docs/spec/dev-authoring-surface.md.
 *
 * The parser is intentionally permissive about line endings, frontmatter
 * delimiters, and missing trailing newlines — devs hand-edit these files,
 * and yaml.parse() is strict enough to catch the structural errors that
 * matter.
 */

import { parse as parseYaml, stringify as stringifyYaml, YAMLParseError } from "yaml";

export interface ParsedFrontmatter {
  /** Parsed YAML object from the frontmatter block. */
  data: Record<string, unknown>;
  /** Markdown body after the closing `---`. Trimmed of a single leading newline. */
  body: string;
  /** Raw frontmatter text (without delimiters). Useful for debugging. */
  rawFrontmatter: string;
}

export class FrontmatterParseError extends Error {
  status = 422;
  constructor(public readonly path: string, message: string, public readonly cause?: unknown) {
    super(`${path}: ${message}`);
    this.name = "FrontmatterParseError";
  }
}

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/;

export function parseFrontmatter(content: string, path = "<unknown>"): ParsedFrontmatter {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { data: {}, body: content, rawFrontmatter: "" };
  }
  const rawFrontmatter = match[1];
  const body = match[2];
  try {
    const parsed = parseYaml(rawFrontmatter);
    const data =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    return { data, body, rawFrontmatter };
  } catch (err) {
    const detail = err instanceof YAMLParseError ? err.message : String(err);
    throw new FrontmatterParseError(path, `invalid YAML frontmatter: ${detail}`, err);
  }
}

/**
 * Serialize frontmatter + body back to a markdown string. Symmetric with
 * parseFrontmatter — round-trippable for documented fields. Used by tests
 * and by the `propose_artifact` MCP verb.
 */
export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const yamlText = stringifyYaml(data, { lineWidth: 0 }).trimEnd();
  const trimmedBody = body.startsWith("\n") ? body : `\n${body}`;
  return `---\n${yamlText}\n---${trimmedBody.endsWith("\n") ? trimmedBody : `${trimmedBody}\n`}`;
}
