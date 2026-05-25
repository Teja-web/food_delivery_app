/**
 * Canonical 6-dim rubric — golden tests.
 *
 * These cases are the spec; if you have to change them, bump RUBRIC_VERSION
 * in `src/lib/prompt-quality/rubric.ts` so previously-scored rows are
 * rescored on next server read.
 */

import { describe, expect, it } from "vitest";

import { RUBRIC_VERSION, scorePromptQuality, formatScoreFeedback } from "@/lib/prompt-quality/rubric";

describe("scorePromptQuality", () => {
  it("returns POOR for empty / vague prompts", () => {
    const s = scorePromptQuality({ content: "fix it" });
    expect(s.tier).toBe("POOR");
    expect(s.flags).toContain("vague_reference");
    expect(s.dimensions.clarity).toBeLessThanOrEqual(50);
  });

  it("returns POOR for very short prompts", () => {
    const s = scorePromptQuality({ content: "halp" });
    expect(s.tier).toBe("POOR");
    expect(s.flags).toContain("too_short");
  });

  it("rewards action verbs + file paths + context + constraints (GOOD)", () => {
    const s = scorePromptQuality({
      content:
        "Add idempotency to src/app/api/v1/payments/route.ts because retries are double-charging customers. Must preserve the existing response shape and avoid breaking changes for the iOS client. Reference issue #482.",
      phase: "development",
    });
    expect(s.tier).toBe("GOOD");
    expect(s.overallScore).toBeGreaterThanOrEqual(80);
    expect(s.dimensions.specificity).toBeGreaterThanOrEqual(60);
    expect(s.dimensions.context).toBeGreaterThanOrEqual(60);
    expect(s.dimensions.constraints).toBeGreaterThanOrEqual(70);
  });

  it("flags secrets and downgrades safety dimension", () => {
    const s = scorePromptQuality({
      content: "Use this bearer token to fix the call: Bearer abcdef0123456789abcdef0123456789",
    });
    expect(s.flags.some((f) => f.startsWith("secret_pattern_detected"))).toBe(true);
    expect(s.dimensions.safety).toBeLessThanOrEqual(30);
  });

  it("detects phase mismatch (deploy ask in development phase)", () => {
    const s = scorePromptQuality({
      content: "Deploy this to production immediately",
      phase: "development",
    });
    expect(s.flags).toContain("phase_mismatch");
    expect(s.dimensions.phaseFit).toBeLessThanOrEqual(40);
  });

  it("is deterministic for the same input + rubric version", () => {
    const input = {
      content: "Refactor src/lib/crud.ts to extract the friendlyDbError helper into its own file.",
      phase: "development" as const,
    };
    const a = scorePromptQuality(input);
    const b = scorePromptQuality(input);
    expect(a).toEqual(b);
    expect(a.rubricVersion).toBe(RUBRIC_VERSION);
  });

  it("formats human-readable feedback", () => {
    const s = scorePromptQuality({ content: "fix it" });
    const txt = formatScoreFeedback(s);
    expect(txt).toContain("Coznt prompt quality:");
    expect(txt).toContain("POOR");
    expect(txt).toContain("Suggestions:");
  });
});
