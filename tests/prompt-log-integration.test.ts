/**
 * Integration coverage for the prompt-log pipeline — without a database.
 *
 * The full pipeline is:
 *
 *   hook / log_prompt → POST /api/v1/mcp/prompts
 *      → capturePrompt() → insert prompt_logs
 *      → (if sub-GOOD) recordPromptQualitySignal() → insert skill_outcomes
 *      → pgmq trigger → recomputeSkillAutonomyTask
 *         → attenuationFactorForProject() → multiplies required-samples
 *
 * The chokepoint test (`tests/chokepoint-invariants.test.ts`) covers the
 * routing invariant. The rubric tests cover scoring determinism. This
 * file covers the *decision math* that bridges them: given a prompt-tier
 * distribution, does the attenuation factor satisfy the spec scenarios?
 *
 * A full DB-touching integration test belongs in the e2e suite where
 * Postgres + pgmq are available; this is the unit-level shim.
 */

import { describe, expect, it } from "vitest";

import { scorePromptQuality } from "@/lib/prompt-quality/rubric";

/**
 * Pure copy of `attenuationFactorForProject`'s math, with the DB call
 * stubbed out. Keep this in lockstep with `src/operations/prompt-log.ts`.
 */
function attenuationFactor(distribution: {
  good: number;
  needsImprovement: number;
  poor: number;
  total: number;
}): number {
  if (distribution.total < 5) return 1.0;
  const goodRatio = distribution.good / distribution.total;
  const poorRatio = distribution.poor / distribution.total;
  if (goodRatio >= 0.8) return 1.0;
  if (poorRatio >= 0.4) {
    const factor = 1.5 + Math.min(1.0, (poorRatio - 0.4) * 1.5);
    return Math.round(factor * 100) / 100;
  }
  const nonGoodRatio = 1 - goodRatio;
  const factor = 1.0 + 0.5 * nonGoodRatio;
  return Math.round(factor * 100) / 100;
}

describe("prompt → tier → signal decision math", () => {
  it("GOOD prompt does not warrant a signal row", () => {
    const score = scorePromptQuality({
      content:
        "Add idempotency to src/app/api/v1/payments/route.ts because retries are double-charging. Must preserve response shape. Issue #482.",
      phase: "development",
    });
    expect(score.tier).toBe("GOOD");
    // capturePrompt() guard: only NEEDS_IMPROVEMENT / POOR emit a signal row.
    const shouldEmitSignal = score.tier === "NEEDS_IMPROVEMENT" || score.tier === "POOR";
    expect(shouldEmitSignal).toBe(false);
  });

  it("POOR prompt warrants a signal row", () => {
    const score = scorePromptQuality({ content: "fix it" });
    expect(score.tier).toBe("POOR");
    const shouldEmitSignal = score.tier === "NEEDS_IMPROVEMENT" || score.tier === "POOR";
    expect(shouldEmitSignal).toBe(true);
  });

  it("secret detection always flags the prompt regardless of tier", () => {
    const score = scorePromptQuality({
      content: "Set Authorization header to Bearer abcdef0123456789abcdef0123456789",
    });
    expect(score.flags.some((f) => f.startsWith("secret_pattern_detected"))).toBe(true);
  });
});

describe("attenuationFactorForProject — spec scenarios", () => {
  it("insufficient samples → 1.0 (no attenuation)", () => {
    expect(attenuationFactor({ good: 0, needsImprovement: 0, poor: 4, total: 4 })).toBe(1.0);
  });

  it("≥80% GOOD → 1.0 (no attenuation)", () => {
    expect(attenuationFactor({ good: 8, needsImprovement: 1, poor: 1, total: 10 })).toBe(1.0);
    expect(attenuationFactor({ good: 16, needsImprovement: 2, poor: 2, total: 20 })).toBe(1.0);
  });

  it("≥40% POOR → factor ≥ 1.5", () => {
    expect(attenuationFactor({ good: 3, needsImprovement: 3, poor: 4, total: 10 })).toBeGreaterThanOrEqual(1.5);
    expect(attenuationFactor({ good: 0, needsImprovement: 0, poor: 10, total: 10 })).toBeGreaterThanOrEqual(1.5);
  });

  it("100% POOR caps at 2.4 (1.5 + 0.9)", () => {
    // factor = 1.5 + min(1.0, (1.0 - 0.4) * 1.5) = 1.5 + min(1.0, 0.9) = 2.4
    expect(attenuationFactor({ good: 0, needsImprovement: 0, poor: 10, total: 10 })).toBe(2.4);
  });

  it("middle distributions get a graduated factor in (1.0, 1.5)", () => {
    // 50% good, 50% needs_improvement (no POOR) → mild attenuation, < 1.5
    const factor = attenuationFactor({ good: 5, needsImprovement: 5, poor: 0, total: 10 });
    expect(factor).toBeGreaterThan(1.0);
    expect(factor).toBeLessThan(1.5);
  });

  it("attenuation factor is deterministic", () => {
    const dist = { good: 4, needsImprovement: 3, poor: 3, total: 10 };
    expect(attenuationFactor(dist)).toBe(attenuationFactor(dist));
  });
});

describe("payload contract: POST /api/v1/mcp/prompts body shape", () => {
  it("hook-prescored prompt carries a complete prescored block", () => {
    const score = scorePromptQuality({ content: "Refactor src/lib/foo.ts", phase: "development" });
    // Shape the server accepts (see src/app/api/v1/mcp/prompts/route.ts bodySchema)
    const body = {
      projectId: "p_1",
      mcpSessionId: "s_1",
      role: "USER" as const,
      source: "CLAUDE_CODE" as const,
      content: "Refactor src/lib/foo.ts",
      phase: "development",
      authorName: "Dev N",
      authorUsername: "devn",
      authorEmail: "dev@example.com",
      clientLocalId: "local-1",
      prescored: {
        overallScore: score.overallScore,
        tier: score.tier,
        dimensions: score.dimensions,
        suggestions: score.suggestions,
        flags: score.flags,
        rubricVersion: score.rubricVersion,
      },
    };
    // Spot-check the contract — these are the load-bearing fields.
    expect(body.prescored.rubricVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(body.prescored.tier).toMatch(/^(GOOD|NEEDS_IMPROVEMENT|POOR)$/);
    expect(typeof body.prescored.overallScore).toBe("number");
    expect(Array.isArray(body.prescored.suggestions)).toBe(true);
    expect(Array.isArray(body.prescored.flags)).toBe(true);
  });
});
