/**
 * `coznt call <verb> [--flag value | --input '<json>']`
 *
 * Direct verb-dispatch for the MCP tool surface — lets developers
 * exercise any registered tool from a terminal without an MCP client.
 *
 *   coznt call get_autonomy
 *   coznt call get_autonomy --skillSlug change-risk-classifier
 *   coznt call get_verification_debt --projectId proj_123
 *   coznt call upsert_plan --input '{"kind":"spec","slug":"x","body":"..."}'
 *
 * Per Decision #4: same `coznt-mcp` package as the stdio server, second
 * `bin` entry as `coznt`. This command bridges the two — the CLI binary
 * loads the same `tools` array the stdio server registers.
 */

import { CozntClient, readConfig } from "../../mcp/client.js";
import { tools } from "../../mcp/server.js";

export interface CallOptions {
  /** First positional arg: the verb name. */
  verb: string | null;
  /** Remaining flags as a Map (CLI parser output). */
  flags: Map<string, string | boolean>;
  /** Output format. */
  format: "json" | "compact";
}

export async function runCall(opts: CallOptions): Promise<number> {
  if (!opts.verb) {
    console.error("Missing verb. Usage: coznt call <verb> [--flag value | --input '<json>']");
    listVerbs();
    return 1;
  }

  const tool = tools.find((t) => t.name === opts.verb);
  if (!tool) {
    console.error(`Unknown verb: ${opts.verb}`);
    listVerbs();
    return 1;
  }

  // Build input. `--input '<json>'` overrides individual flags; otherwise
  // collect flags directly. Type coercion is best-effort — Zod parses
  // strings into the target type for simple scalars.
  let rawInput: Record<string, unknown> = {};
  const inputFlag = opts.flags.get("input");
  if (typeof inputFlag === "string") {
    try {
      rawInput = JSON.parse(inputFlag) as Record<string, unknown>;
    } catch (err) {
      console.error(`--input must be valid JSON: ${(err as Error).message}`);
      return 1;
    }
  } else {
    for (const [key, value] of opts.flags.entries()) {
      if (key === "input" || key === "format") continue;
      rawInput[key] = value;
    }
  }

  // Coerce string flags to numbers / booleans when the schema asks for them.
  // Best-effort: Zod will throw a parse error if coercion can't be matched.
  const parsed = tool.schema.safeParse(coerceForSchema(rawInput, tool.schema));
  if (!parsed.success) {
    console.error(`Invalid input for ${tool.name}:`);
    console.error(parsed.error.message);
    return 1;
  }

  const cfg = readConfig();
  const client = new CozntClient(cfg);

  try {
    const result = await (tool.run as (c: CozntClient, i: unknown) => Promise<unknown>)(
      client,
      parsed.data,
    );
    if (opts.format === "compact") {
      console.log(JSON.stringify(result));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`call ${tool.name} failed: ${msg}`);
    return 1;
  }
}

function listVerbs(): void {
  console.error("\nAvailable verbs:");
  for (const t of [...tools].sort((a, b) => a.name.localeCompare(b.name))) {
    console.error(`  ${t.name}`);
  }
}

/**
 * Best-effort string-to-primitive coercion. Walks the top-level keys of
 * the Zod object schema. We don't introspect deep — `--input` is the
 * escape hatch for nested shapes.
 */
function coerceForSchema(
  input: Record<string, unknown>,
  schema: unknown,
): Record<string, unknown> {
  const shape = getSchemaShape(schema);
  if (!shape) return input;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    const fieldDef = shape[key];
    const typeName = fieldDef ? getInnerTypeName(fieldDef) : null;
    if (raw === true || raw === false) {
      // Bool flag — pass through; Zod will reject if the schema wants a number.
      out[key] = raw;
    } else if (typeof raw === "string") {
      if (typeName === "ZodNumber") {
        const n = Number(raw);
        out[key] = Number.isFinite(n) ? n : raw;
      } else if (typeName === "ZodBoolean") {
        out[key] = raw === "true" || raw === "1";
      } else {
        out[key] = raw;
      }
    } else {
      out[key] = raw;
    }
  }
  return out;
}

function getSchemaShape(schema: unknown): Record<string, unknown> | null {
  // Zod v3: schema._def.shape() / Zod v4: schema._def.shape
  const def = (schema as { _def?: { shape?: unknown; typeName?: string } })._def;
  if (!def) return null;
  if (typeof def.shape === "function") {
    return (def.shape as () => Record<string, unknown>)();
  }
  if (def.shape && typeof def.shape === "object") {
    return def.shape as Record<string, unknown>;
  }
  return null;
}

function getInnerTypeName(field: unknown): string | null {
  // Unwrap optional/nullable wrappers to find the inner primitive type.
  let cur = field as { _def?: { typeName?: string; innerType?: unknown } } | undefined;
  for (let i = 0; i < 5 && cur?._def; i++) {
    const tn = cur._def.typeName;
    if (tn === "ZodOptional" || tn === "ZodNullable" || tn === "ZodDefault") {
      cur = cur._def.innerType as typeof cur;
      continue;
    }
    return tn ?? null;
  }
  return null;
}
