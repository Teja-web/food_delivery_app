/**
 * Entity Tools Generator
 *
 * Generates AI SDK tools from CRUD operations.
 * Two tools per entity: get{Entity} and search{Entity}s.
 * No hand-written tool boilerplate — just pass your CRUD instance.
 */

import { createTool } from "@/app/api/ai/ask/create-tool";
import { z } from "zod";
import type { Tool as CoreTool } from "ai";
import { getActionContext } from "@/lib/auth/context";

// -- Types --------------------------------------------------------------------

interface EntityToolConfig {
  /** Entity key, e.g. "candidate" */
  entity: string;
  /** Display name, e.g. "Candidate" */
  displayName: string;
  /** CRUD .get(id) — returns a single record */
  getter: (id: string) => Promise<unknown>;
  /** CRUD .search(query, opts) — keyword search, relevance-ranked */
  searcher: (
    query: string,
    opts?: { offset?: number; limit?: number },
  ) => Promise<{ items: unknown[]; total: number }>;
  /** Fields to include in AI tool output (picks from result object) */
  fields?: string[];
  /** Custom description for the get tool (overrides generic) */
  getDescription?: string;
  /** Custom description for the search tool (overrides generic) */
  searchDescription?: string;
}

// -- Helpers ------------------------------------------------------------------

function pickFields(
  obj: unknown,
  fields?: string[],
): Record<string, unknown> {
  if (!obj || typeof obj !== "object") return {};
  if (!fields) return obj as Record<string, unknown>;
  const record = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in record) {
      result[field] = record[field];
    }
  }
  return result;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// -- Tool name derivation -----------------------------------------------------

/**
 * Derive the tool names that createEntityTools() will generate.
 */
function deriveEntityToolNames(
  entities: EntityToolConfig[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const c of entities) {
    const E = cap(c.entity);
    result[c.entity] = [`get${E}`, `search${E}s`];
  }
  return result;
}

// -- Factory ------------------------------------------------------------------

export function createEntityTools(
  entities: EntityToolConfig[],
): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {};

  for (const config of entities) {
    const { entity, displayName, getter, searcher, fields, getDescription, searchDescription } = config;
    const Entity = cap(entity);
    const idDesc = `The ${displayName} ID`;

    // GET: get{Entity}
    tools[`get${Entity}`] = createTool({
      description: getDescription ?? `Get a ${displayName.toLowerCase()} by ID with full details.`,
      inputSchema: z.object({ id: z.string().describe(idDesc) }),
      execute: async ({ id }) => {
        // Verify org context exists before querying (ensures org filtering is applied)
        try {
          const ctx = await getActionContext();
          if (!ctx?.organizationId) {
            return { error: "Unable to determine organization context. Please refresh and try again." };
          }
        } catch {
          return { error: "Authentication required. Please refresh and try again." };
        }

        const result = await getter(id);
        if (!result) return { error: `${displayName} not found` };
        return pickFields(result, fields);
      },
    });

    // SEARCH: search{Entity}s
    tools[`search${Entity}s`] = createTool({
      description: searchDescription ?? `Search ${displayName.toLowerCase()} records by keyword. Returns results ranked by relevance.`,
      inputSchema: z.object({
        query: z.string().describe(`Search query for ${displayName.toLowerCase()}s`),
        limit: z.number().optional().default(20).describe("Max results"),
      }),
      execute: async ({ query, limit }) => {
        // Verify org context exists before querying (ensures org filtering is applied)
        try {
          const ctx = await getActionContext();
          if (!ctx?.organizationId) {
            return { error: "Unable to determine organization context. Please refresh and try again." };
          }
        } catch {
          return { error: "Authentication required. Please refresh and try again." };
        }

        const result = await searcher(query, { offset: 0, limit: limit ?? 20 });
        return {
          total: result.total,
          items: result.items.map((item) => pickFields(item, fields)),
        };
      },
    });
  }

  return tools;
}
