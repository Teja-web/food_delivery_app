/**
 * Per-turn phase posture — the prompt hook now always injects a posture
 * line via `additionalContext`, regardless of rubric score. Verifies the
 * exact shape for each phase and the unbound-project fallback.
 */

import { describe, expect, it } from "vitest";

import { buildPhasePosture } from "../scripts/hook-src/coznt-capture-prompt-hook.mjs";

describe("buildPhasePosture", () => {
  it("returns the unbound-project reminder when phase is null", () => {
    const text = buildPhasePosture(null);
    expect(text).toContain("not bound");
    expect(text).toContain("get_my_context");
  });

  it("returns the unbound-project reminder when phase is undefined", () => {
    const text = buildPhasePosture(undefined);
    expect(text).toContain("not bound");
  });

  it("emits phase + forbidden list for each known phase", () => {
    const phases = [
      "requirements",
      "design",
      "development",
      "testing",
      "cicd",
      "monitoring",
    ];
    for (const phase of phases) {
      const text = buildPhasePosture(phase);
      expect(text, `phase=${phase}`).toContain(`phase=${phase}`);
      expect(text, `phase=${phase}`).toContain("forbidden in this phase:");
      expect(text, `phase=${phase}`).toContain("surface that to the user");
    }
  });

  it("requirements posture names scaffolding as forbidden", () => {
    const text = buildPhasePosture("requirements");
    expect(text).toContain("scaffolding");
    expect(text).toContain("create-next-app");
  });

  it("monitoring posture names deploys as forbidden", () => {
    const text = buildPhasePosture("monitoring");
    expect(text).toContain("deploy");
  });

  it("falls back gracefully on unknown phase", () => {
    const text = buildPhasePosture("some_future_phase");
    expect(text).toContain("phase=some_future_phase");
    expect(text).toContain("get_my_context");
  });
});
