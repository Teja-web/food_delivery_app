/**
 * Protocol-contract tests for the MCP tool registry.
 *
 * Verifies every registered verb satisfies the invariants an MCP
 * client expects:
 *   - distinct, snake_case names
 *   - non-empty descriptions
 *   - Zod input schema that emits clean JSON Schema (the SDK calls
 *     `inputSchema: zodToJsonSchema(schema)` on tools/list responses)
 *   - run() handler is a function
 *
 * Side effects to avoid: this file does NOT call `createCozntMcpServer`
 * (which reads `COZNT_API_KEY` from env). It imports the registry
 * directly so the test harness doesn't need env setup.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { RESOURCES, tools } from "@/mcp/server";

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

describe("MCP tool registry", () => {
  it("has at least the 21 verbs ported from SDLC", () => {
    expect(tools.length).toBeGreaterThanOrEqual(21);
  });

  it("every tool has a unique name", () => {
    const names = tools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("every tool name is snake_case", () => {
    for (const t of tools) {
      expect(t.name, `"${t.name}" violates snake_case`).toMatch(SNAKE_CASE);
    }
  });

  it("every tool has a non-empty description", () => {
    for (const t of tools) {
      expect(t.description, `"${t.name}" has empty description`).toBeTruthy();
      expect(t.description.length, `"${t.name}" description too short`).toBeGreaterThan(20);
    }
  });

  it("every tool's Zod schema emits valid JSON Schema", () => {
    for (const t of tools) {
      // The SDK calls z.toJSONSchema on the input schema to advertise it
      // to clients. If this throws, the tool is unusable.
      expect(() => z.toJSONSchema(t.schema), `${t.name} schema emission failed`).not.toThrow();
      const json = z.toJSONSchema(t.schema) as { type?: string; properties?: unknown };
      expect(json, `${t.name} emitted empty JSON Schema`).toBeTruthy();
    }
  });

  it("every tool has a run handler that's a function", () => {
    for (const t of tools) {
      expect(typeof t.run, `${t.name} run is not a function`).toBe("function");
    }
  });

  it("includes all Tier 1 verbs", () => {
    const names = new Set(tools.map((t) => t.name));
    const tier1 = [
      "set_project",
      "switch_project",
      "get_my_context",
      "get_project_status",
      "get_phase_checklist",
      "get_requirements",
      "get_assigned_work",
      "check_standards",
      "submit_phase_for_review",
      "advance_phase",
    ];
    for (const v of tier1) {
      expect(names.has(v), `missing Tier-1 verb: ${v}`).toBe(true);
    }
  });

  it("includes all Tier 2 verbs (except blocked create_pr)", () => {
    const names = new Set(tools.map((t) => t.name));
    const tier2 = [
      "create_requirement",
      "push_requirements",
      "log_decision",
      "get_design_context",
      "update_work_item_status",
      "update_test_result",
      "get_pipeline_status",
    ];
    for (const v of tier2) {
      expect(names.has(v), `missing Tier-2 verb: ${v}`).toBe(true);
    }
  });

  it("includes all Tier 3 verbs (except blocked push_to_external)", () => {
    const names = new Set(tools.map((t) => t.name));
    const tier3 = [
      "invoke_skill",
      "generate_tests",
      "draft_requirement",
      "list_draft_requirements",
      "update_draft_requirement",
      "delete_draft_requirement",
    ];
    for (const v of tier3) {
      expect(names.has(v), `missing Tier-3 verb: ${v}`).toBe(true);
    }
  });

  it("includes all Tier 4 (distribution) verbs", () => {
    const names = new Set(tools.map((t) => t.name));
    const tier4 = ["list_choreographies", "sync_choreographies"];
    for (const v of tier4) {
      expect(names.has(v), `missing Tier-4 verb: ${v}`).toBe(true);
    }
  });

  it("includes all Tier 5 (knowledge) verbs", () => {
    const names = new Set(tools.map((t) => t.name));
    const tier5 = ["search_learnings", "search_plans", "search_outcomes", "search_audit"];
    for (const v of tier5) {
      expect(names.has(v), `missing Tier-5 verb: ${v}`).toBe(true);
    }
  });
});

describe("MCP resource registry", () => {
  it("has at least the 3 documented resources", () => {
    expect(RESOURCES.length).toBeGreaterThanOrEqual(3);
  });

  it("every resource has uri, name, description, mimeType, read", () => {
    for (const r of RESOURCES) {
      expect(r.uri, `resource missing uri`).toBeTruthy();
      expect(r.uri.startsWith("coznt://"), `${r.uri} uses unexpected scheme`).toBe(true);
      expect(r.name).toBeTruthy();
      expect(r.description).toBeTruthy();
      expect(r.mimeType).toBeTruthy();
      expect(typeof r.read).toBe("function");
    }
  });

  it("every resource uri is unique", () => {
    const uris = RESOURCES.map((r) => r.uri);
    expect(new Set(uris).size).toBe(uris.length);
  });
});
