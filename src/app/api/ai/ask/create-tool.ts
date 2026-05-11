import { tool, type Tool } from "ai";
import { z } from "zod";
import { z as z4 } from "zod/v4";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CoreTool = Tool<any, any>;

/**
 * Tool definition type
 */
type ToolDef<TParams extends z.ZodType = z.ZodType> = {
  description: string;
  inputSchema: TParams;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (params: z.infer<TParams>) => Promise<any>;
};

/**
 * Patch a zod schema so z.coerce.date() fields serialize as
 * { type: "string", format: "date-time" } in JSON Schema.
 *
 * The AI SDK detects zod schemas by vendor === "zod" and calls
 * z.toJSONSchema() directly, which throws on Date types.
 * By changing the vendor, the AI SDK falls back to the Standard Schema
 * path and calls our patched jsonSchema.input() instead.
 * Validation still runs through zod — only serialization is affected.
 */
function patchDateJsonSchema<T extends z.ZodType>(schema: T): T {
  const std = (schema as any)["~standard"];
  if (!std?.jsonSchema) return schema;
  std.vendor = "zod-patched";
  std.jsonSchema.input = () =>
    z4.toJSONSchema(schema as any, {
      unrepresentable: "any",
      override: ({ zodSchema, jsonSchema }) => {
        if ((zodSchema as any)._zod?.def?.type === "date") {
          jsonSchema.type = "string";
          (jsonSchema as any).format = "date-time";
        }
      },
    });
  return schema;
}

/**
 * Creates a single AI SDK tool
 *
 * @example
 * ```ts
 * const searchTool = createTool({
 *   description: "Search candidates by skills or experience",
 *   inputSchema: z.object({
 *     query: z.string().describe("Search query"),
 *     limit: z.number().optional().default(10),
 *   }),
 *   execute: async ({ query, limit }) => searchCandidates(query, limit),
 * });
 * ```
 */
export function createTool<TParams extends z.ZodType>(
  config: ToolDef<TParams>
): CoreTool {
  return tool({
    description: config.description,
    inputSchema: patchDateJsonSchema(config.inputSchema) as z.ZodType,
    execute: config.execute as (params: unknown) => Promise<unknown>,
  }) as CoreTool;
}

/**
 * Creates multiple tools from a record of definitions
 *
 * @example
 * ```ts
 * const tools = createTools({
 *   searchCandidates: {
 *     description: "Search candidates by query",
 *     inputSchema: z.object({ query: z.string(), limit: z.number().optional() }),
 *     execute: async ({ query, limit }) => searchCandidates(query, limit),
 *   },
 *   searchJobs: {
 *     description: "Search job requisitions",
 *     inputSchema: z.object({ query: z.string(), limit: z.number().optional() }),
 *     execute: async ({ query, limit }) => searchJobs(query, limit),
 *   },
 * });
 * ```
 */
function createTools<T extends Record<string, ToolDef>>(
  definitions: T
): Record<keyof T, CoreTool> {
  const tools = {} as Record<keyof T, CoreTool>;

  for (const [name, def] of Object.entries(definitions)) {
    tools[name as keyof T] = createTool(def);
  }

  return tools;
}

// { tool, z } available but not re-exported

