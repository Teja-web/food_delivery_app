/**
 * Tests for the `recommendedKickoff` machinery:
 *   - State enumeration is closed and matches CHOREOGRAPHY.md rule keys.
 *   - Routing block parsing round-trips through the project-lifecycle file.
 *   - Parser handles malformed/partial routing blocks without throwing.
 *
 * The DB-touching resolver (resolveRecommendedKickoff) is covered at the
 * integration level — these tests pin the pure pieces.
 */

import { describe, expect, it } from "vitest";

import { readChoreographyContent } from "@/operations/choreography/choreographies";
import { resolveKickoffState } from "@/lib/agent-context/recommended-kickoff";

describe("resolveKickoffState — requirements phase", () => {
  it("returns 'empty' when no plans exist", () => {
    const s = resolveKickoffState({
      phase: "requirements",
      planCount: 0,
      hasEpic: false,
      hasFeature: false,
      hasApprovedPlan: false,
    });
    expect(s).toBe("empty");
  });

  it("returns 'has_epic_no_feature' when an epic exists but no features", () => {
    const s = resolveKickoffState({
      phase: "requirements",
      planCount: 1,
      hasEpic: true,
      hasFeature: false,
      hasApprovedPlan: false,
    });
    expect(s).toBe("has_epic_no_feature");
  });

  it("returns 'ready_for_advance' once at least one plan is approved", () => {
    const s = resolveKickoffState({
      phase: "requirements",
      planCount: 3,
      hasEpic: false,
      hasFeature: true,
      hasApprovedPlan: true,
    });
    expect(s).toBe("ready_for_advance");
  });

  it("returns 'has_leaves_no_parent' when stories exist with no epic/feature anchor", () => {
    // The "5 flat stories" scenario — agent drafted leaves but no
    // organizing parent. Should route the coach to feature-spec-generator.
    const s = resolveKickoffState({
      phase: "requirements",
      planCount: 5,
      hasEpic: false,
      hasFeature: false,
      hasApprovedPlan: false,
    });
    expect(s).toBe("has_leaves_no_parent");
  });
});

describe("resolveKickoffState — other phases", () => {
  it("returns 'empty' for any phase with zero plans", () => {
    for (const phase of ["design", "development", "testing", "cicd", "monitoring"] as const) {
      const s = resolveKickoffState({
        phase,
        planCount: 0,
        hasEpic: false,
        hasFeature: false,
        hasApprovedPlan: false,
      });
      expect(s, `phase=${phase}`).toBe("empty");
    }
  });

  it("returns 'none' for non-requirements phases with mid-flight state", () => {
    const s = resolveKickoffState({
      phase: "development",
      planCount: 5,
      hasEpic: false,
      hasFeature: false,
      hasApprovedPlan: true,
    });
    expect(s).toBe("none");
  });
});

describe("readChoreographyContent — routing block parsing", () => {
  it("parses the project-lifecycle routing rules end-to-end", () => {
    const body = [
      "---",
      "description: lifecycle coach test fixture",
      "coznt:",
      "  version: 1.0.0",
      "  min_autonomy: propose",
      "  routing:",
      "    - phase: requirements",
      "      state: empty",
      "      kickoff: \"invoke_skill: feature-spec-generator\"",
      "      rationale: \"Empty project — start with a feature.\"",
      "    - phase: requirements",
      "      state: ready_for_advance",
      "      kickoff: \"invoke_skill: requirements-document\"",
      "      rationale: \"End of phase — consolidate.\"",
      "---",
      "",
      "# Test",
    ].join("\n");

    const parsed = readChoreographyContent(body);
    expect(parsed).not.toBeNull();
    expect(parsed!.parsed.routing).toHaveLength(2);
    expect(parsed!.parsed.routing[0]).toEqual({
      phase: "requirements",
      state: "empty",
      kickoff: "invoke_skill: feature-spec-generator",
      rationale: "Empty project — start with a feature.",
    });
    expect(parsed!.parsed.routing[1].kickoff).toBe("invoke_skill: requirements-document");
  });

  it("returns an empty routing array when no routing block is present", () => {
    const body = [
      "---",
      "description: no routing here",
      "coznt:",
      "  version: 1.0.0",
      "  min_autonomy: observe",
      "---",
      "",
      "# Body",
    ].join("\n");
    const parsed = readChoreographyContent(body);
    expect(parsed).not.toBeNull();
    expect(parsed!.parsed.routing).toEqual([]);
  });

  it("silently drops rules missing required fields", () => {
    const body = [
      "---",
      "description: partial",
      "coznt:",
      "  routing:",
      "    - phase: requirements",
      "      state: empty",
      // missing kickoff + rationale
      "    - phase: requirements",
      "      state: has_epic_no_feature",
      "      kickoff: \"invoke_skill: feature-spec-generator\"",
      "      rationale: \"Epic exists.\"",
      "---",
      "",
    ].join("\n");
    const parsed = readChoreographyContent(body);
    expect(parsed!.parsed.routing).toHaveLength(1);
    expect(parsed!.parsed.routing[0].state).toBe("has_epic_no_feature");
  });

  it("still parses description, version, and min_autonomy alongside routing", () => {
    const body = [
      "---",
      "description: combined fixture",
      "coznt:",
      "  version: 2.1.0",
      "  min_autonomy: merge",
      "  routing:",
      "    - phase: design",
      "      state: empty",
      "      kickoff: \"invoke_skill: adr-extractor\"",
      "      rationale: \"Design phase open.\"",
      "---",
      "",
    ].join("\n");
    const parsed = readChoreographyContent(body);
    expect(parsed!.parsed.description).toBe("combined fixture");
    expect(parsed!.parsed.version).toBe("2.1.0");
    expect(parsed!.parsed.minAutonomy).toBe("merge");
    expect(parsed!.parsed.routing).toHaveLength(1);
  });

  it("returns null when frontmatter delimiter is missing", () => {
    expect(readChoreographyContent("no frontmatter here")).toBeNull();
  });
});

describe("project-lifecycle/SKILL.md — shipped routing rules", () => {
  it("ships a non-empty routing block from the real file on disk", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const path = join(
      process.cwd(),
      "src/automations/skills/project-lifecycle/SKILL.md",
    );
    const content = readFileSync(path, "utf8");
    const parsed = readChoreographyContent(content);
    expect(parsed).not.toBeNull();
    const rules = parsed!.parsed.routing;
    expect(rules.length).toBeGreaterThan(0);

    // Every shipped rule must reference a state name that the resolver
    // actually emits, otherwise it's dead text.
    const knownStates = new Set([
      "empty",
      "has_epic_no_feature",
      "has_leaves_no_parent",
      "ready_for_advance",
    ]);
    for (const rule of rules) {
      expect(knownStates.has(rule.state), `unknown state in rule: ${rule.state}`).toBe(true);
      expect(rule.kickoff.length).toBeGreaterThan(0);
      expect(rule.rationale.length).toBeGreaterThan(0);
    }
  });
});
