/**
 * Drift detection: the local MCP-side phase data must stay in sync with
 * the route-side authoritative engine. The two-layer model (route =
 * authoritative, MCP-side = sub-ms fast-fail) is correct-but-soft —
 * route still rejects on drift, so this isn't a correctness bug. It
 * is, however, a missed fast-fail that confuses agents. Keep them
 * aligned.
 */

import { describe, expect, it } from "vitest";

import * as routeSide from "@/lib/mcp/phase-enforcement";
import * as mcpSide from "@/mcp/phase-data";

describe("phase-data sync (mcp-side ↔ route-side)", () => {
  it("ALWAYS_ALLOWED contains the same verbs in both layers", () => {
    const routeSet = [...routeSide.ALWAYS_ALLOWED].sort();
    const mcpSet = [...mcpSide.ALWAYS_ALLOWED].sort();
    expect(mcpSet).toEqual(routeSet);
  });

  it("TOOL_PHASE_MAP has the same verb keys in both layers", () => {
    const routeKeys = Object.keys(routeSide.TOOL_PHASE_MAP).sort();
    const mcpKeys = Object.keys(mcpSide.TOOL_PHASE_MAP).sort();
    expect(mcpKeys).toEqual(routeKeys);
  });

  it("TOOL_PHASE_MAP has the same allowed phases per verb in both layers", () => {
    for (const [verb, routePhases] of Object.entries(routeSide.TOOL_PHASE_MAP)) {
      const mcpPhases = mcpSide.TOOL_PHASE_MAP[verb];
      expect(mcpPhases, `verb "${verb}" missing or mismatched on mcp side`).toEqual(
        routePhases,
      );
    }
  });

  it("the phase enum is the same in both layers", () => {
    // Route-side sources from PROJECT_PHASES (@/db/schema/project); mcp-side
    // hardcodes. Mismatch here means the DB schema changed phases and the
    // mcp snapshot hasn't been updated.
    const routePhases = Object.values(routeSide.TOOL_PHASE_MAP).flat();
    const uniqueRoutePhases = [...new Set(routePhases)].sort();
    const mcpPhases = [...mcpSide.PHASES].sort();
    for (const p of uniqueRoutePhases) {
      expect(mcpPhases, `route-side uses phase "${p}" which is missing from mcp PHASES`).toContain(
        p,
      );
    }
  });
});
