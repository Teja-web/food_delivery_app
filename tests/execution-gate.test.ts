/**
 * Decision-function tests for the execution gate.
 *
 * Pure-function tests — no DB, no HTTP. Covers the 5-rule policy in
 * `docs/execution-gate-plan.md`. If you change a rule, change a case here.
 */

import { describe, expect, it } from "vitest";

import { decideExecutionGate, type GateInput } from "@/operations/execution-gate";

function baseInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    organizationId: "org_1",
    projectId: "proj_1",
    prRef: "github:acme/api#1",
    skillId: "skill_1",
    skillLevel: 2, // senior
    changeRisk: "low",
    ruleViolations: [],
    phase: "development",
    hasHumanApproval: false,
    ...overrides,
  };
}

describe("decideExecutionGate", () => {
  it("returns failure on any error-severity rule violation, regardless of autonomy", () => {
    const v = decideExecutionGate(
      baseInput({
        skillLevel: 3, // principal
        changeRisk: "low",
        ruleViolations: [{ ruleId: "no-secrets-in-code", severity: "error" }],
      }),
    );
    expect(v.verdict).toBe("failure");
    expect(v.reason).toMatch(/error-severity/);
  });

  it("returns failure when the project is not in development phase", () => {
    const v = decideExecutionGate(baseInput({ phase: "testing" }));
    expect(v.verdict).toBe("failure");
    expect(v.reason).toMatch(/testing phase/);
  });

  it("returns success when a human approval is present, even if autonomy is too low", () => {
    const v = decideExecutionGate(
      baseInput({ skillLevel: 0, changeRisk: "high", hasHumanApproval: true }),
    );
    expect(v.verdict).toBe("success");
    expect(v.reason).toMatch(/human/i);
  });

  it("returns neutral when there is no skill attribution", () => {
    const v = decideExecutionGate(baseInput({ skillId: null, skillLevel: null }));
    expect(v.verdict).toBe("neutral");
  });

  it("blocks intern (level 0) on every risk class", () => {
    for (const risk of ["low", "medium", "high"] as const) {
      const v = decideExecutionGate(baseInput({ skillLevel: 0, changeRisk: risk }));
      expect(v.verdict).toBe("failure");
    }
  });

  it("junior (level 1) allows low risk only", () => {
    expect(decideExecutionGate(baseInput({ skillLevel: 1, changeRisk: "low" })).verdict).toBe("success");
    expect(decideExecutionGate(baseInput({ skillLevel: 1, changeRisk: "medium" })).verdict).toBe("failure");
    expect(decideExecutionGate(baseInput({ skillLevel: 1, changeRisk: "high" })).verdict).toBe("failure");
  });

  it("senior (level 2) allows low + medium, blocks high", () => {
    expect(decideExecutionGate(baseInput({ skillLevel: 2, changeRisk: "low" })).verdict).toBe("success");
    expect(decideExecutionGate(baseInput({ skillLevel: 2, changeRisk: "medium" })).verdict).toBe("success");
    expect(decideExecutionGate(baseInput({ skillLevel: 2, changeRisk: "high" })).verdict).toBe("failure");
  });

  it("principal (level 3) allows every risk class", () => {
    for (const risk of ["low", "medium", "high"] as const) {
      const v = decideExecutionGate(baseInput({ skillLevel: 3, changeRisk: risk }));
      expect(v.verdict).toBe("success");
    }
  });

  it("warn-severity violations don't block but are listed in details", () => {
    const v = decideExecutionGate(
      baseInput({
        ruleViolations: [{ ruleId: "pr-checklist-complete", severity: "warn" }],
      }),
    );
    expect(v.verdict).toBe("success");
    expect(v.details.some((d) => d.includes("warn"))).toBe(true);
  });

  it("phase mismatch beats human approval (you can't approve a Testing-phase code change)", () => {
    const v = decideExecutionGate(
      baseInput({ phase: "testing", hasHumanApproval: true, skillLevel: 3 }),
    );
    expect(v.verdict).toBe("failure");
  });

  it("error-severity rule beats human approval (you can't approve secrets in code)", () => {
    const v = decideExecutionGate(
      baseInput({
        ruleViolations: [{ ruleId: "no-secrets-in-code", severity: "error" }],
        hasHumanApproval: true,
        skillLevel: 3,
      }),
    );
    expect(v.verdict).toBe("failure");
  });
});
