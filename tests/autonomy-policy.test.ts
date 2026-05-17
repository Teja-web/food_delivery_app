/**
 * `autonomy-threshold` rule kind — policy-aware execution gate.
 *
 * Two test surfaces:
 *   1. Pure decisions in `decideExecutionGate` with the new `policy` input.
 *   2. Frontmatter parsing in `parseAutonomyThresholdConfig`.
 *
 * The `resolveAutonomyThreshold` DB-resolver is exercised end-to-end
 * via mocked-fetch integration tests in the e2e suite (where Postgres
 * is available). Here we keep it unit-level.
 */

import { describe, expect, it } from "vitest";

import { decideExecutionGate, type GateInput } from "@/operations/execution-gate";
import {
  parseAutonomyThresholdConfig,
  ruleMatches,
  requiredLevelInt,
  type AutonomyThresholdConfig,
} from "@/lib/rule-validators/autonomy-threshold";

function baseInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    organizationId: "org_1",
    projectId: "proj_1",
    prRef: "github:acme/api#1",
    skillId: "skill_1",
    skillLevel: 1, // propose
    changeRisk: "low",
    ruleViolations: [],
    phase: "development",
    hasHumanApproval: false,
    ...overrides,
  };
}

describe("decideExecutionGate with policy", () => {
  it("default fallback: propose (level 1) clears low-risk merge", () => {
    const v = decideExecutionGate(baseInput({ skillLevel: 1, changeRisk: "low" }));
    expect(v.verdict).toBe("success");
    expect(v.details.some((d) => d.includes("default fallback"))).toBe(true);
    expect(v.enforcedByRuleId).toBeNull();
  });

  it("default fallback: propose (level 1) blocked on medium-risk merge", () => {
    const v = decideExecutionGate(baseInput({ skillLevel: 1, changeRisk: "medium" }));
    expect(v.verdict).toBe("failure");
    expect(v.enforcedByRuleId).toBeNull();
  });

  it("policy override: a rule requires lead for low-risk merge → propose blocked", () => {
    const v = decideExecutionGate(
      baseInput({
        skillLevel: 1,
        changeRisk: "low",
        policy: { minLevel: 3, enforcedByRuleId: "rule_abc" },
      }),
    );
    expect(v.verdict).toBe("failure");
    expect(v.enforcedByRuleId).toBe("rule_abc");
    expect(v.details.some((d) => d.includes("rule rule_abc"))).toBe(true);
  });

  it("policy override: a rule loosens medium-risk to propose → propose passes", () => {
    const v = decideExecutionGate(
      baseInput({
        skillLevel: 1,
        changeRisk: "medium",
        policy: { minLevel: 1, enforcedByRuleId: "rule_xyz" },
      }),
    );
    expect(v.verdict).toBe("success");
    expect(v.enforcedByRuleId).toBe("rule_xyz");
  });

  it("policy override: Infinity minLevel never auto-merges", () => {
    const v = decideExecutionGate(
      baseInput({
        skillLevel: 3, // lead
        changeRisk: "high",
        policy: { minLevel: Infinity, enforcedByRuleId: "rule_strict" },
      }),
    );
    expect(v.verdict).toBe("failure");
    expect(v.reason).toMatch(/not authorised/);
    expect(v.details.some((d) => d.match(/Auto-merge disabled/))).toBe(true);
  });

  it("policy override is bypassed by a human approval", () => {
    const v = decideExecutionGate(
      baseInput({
        skillLevel: 0,
        changeRisk: "high",
        hasHumanApproval: true,
        policy: { minLevel: 3, enforcedByRuleId: "rule_strict" },
      }),
    );
    expect(v.verdict).toBe("success");
    expect(v.reason).toMatch(/human/i);
  });

  it("policy override does NOT save a PR with an error-severity rule violation", () => {
    const v = decideExecutionGate(
      baseInput({
        skillLevel: 3,
        changeRisk: "low",
        ruleViolations: [{ ruleId: "no-secrets", severity: "error" }],
        policy: { minLevel: 0, enforcedByRuleId: "rule_loose" },
      }),
    );
    expect(v.verdict).toBe("failure");
    expect(v.reason).toMatch(/error-severity/);
  });
});

describe("parseAutonomyThresholdConfig", () => {
  it("parses a valid rule body", () => {
    const body = `---
validator: autonomy-threshold
actionKind: merge_pr
changeRisk: low
minAutonomy: merge
---

# Lock low-risk merges to Merge level`;
    const result = parseAutonomyThresholdConfig(body);
    expect(result.config).not.toBeNull();
    if (result.config) {
      expect(result.config.actionKind).toBe("merge_pr");
      expect(result.config.changeRisk).toBe("low");
      expect(result.config.minAutonomy).toBe("merge");
    }
  });

  it("returns null when validator is not autonomy-threshold", () => {
    const body = `---
validator: keyword-presence
requires: ["foo"]
---

body`;
    const result = parseAutonomyThresholdConfig(body);
    expect(result.config).toBeNull();
  });

  it("returns null with a reason when minAutonomy is invalid", () => {
    const body = `---
validator: autonomy-threshold
actionKind: merge_pr
changeRisk: low
minAutonomy: wizard
---`;
    const result = parseAutonomyThresholdConfig(body);
    expect(result.config).toBeNull();
    if (result.config === null) {
      expect(result.reason).toMatch(/wizard|enum|invalid/i);
    }
  });

  it("returns null when frontmatter delimiters are missing", () => {
    const result = parseAutonomyThresholdConfig("just markdown");
    expect(result.config).toBeNull();
  });

  it("accepts wildcards in actionKind and changeRisk", () => {
    const body = `---
validator: autonomy-threshold
actionKind: "*"
changeRisk: "*"
minAutonomy: lead
---`;
    const result = parseAutonomyThresholdConfig(body);
    expect(result.config).not.toBeNull();
    if (result.config) {
      expect(result.config.actionKind).toBe("*");
      expect(result.config.changeRisk).toBe("*");
    }
  });
});

describe("ruleMatches", () => {
  const cfg = (overrides: Partial<AutonomyThresholdConfig> = {}): AutonomyThresholdConfig => ({
    actionKind: "merge_pr",
    changeRisk: "medium",
    minAutonomy: "merge",
    ...overrides,
  });

  it("matches exact (actionKind, changeRisk) tuple", () => {
    expect(ruleMatches(cfg(), "merge_pr", "medium")).toBe(true);
  });

  it("does not match when actionKind differs", () => {
    expect(ruleMatches(cfg(), "deploy_production", "medium")).toBe(false);
  });

  it("does not match when changeRisk differs", () => {
    expect(ruleMatches(cfg(), "merge_pr", "low")).toBe(false);
  });

  it("wildcard actionKind matches any action", () => {
    expect(ruleMatches(cfg({ actionKind: "*" }), "deploy_production", "medium")).toBe(true);
  });

  it("wildcard changeRisk matches any risk", () => {
    expect(ruleMatches(cfg({ changeRisk: "*" }), "merge_pr", "critical")).toBe(true);
  });

  it("double wildcard matches everything", () => {
    expect(
      ruleMatches(cfg({ actionKind: "*", changeRisk: "*" }), "co_sign_promotion", "high"),
    ).toBe(true);
  });
});

describe("requiredLevelInt", () => {
  it("maps each label to its level", () => {
    expect(requiredLevelInt({ actionKind: "*", changeRisk: "*", minAutonomy: "observe" })).toBe(0);
    expect(requiredLevelInt({ actionKind: "*", changeRisk: "*", minAutonomy: "propose" })).toBe(1);
    expect(requiredLevelInt({ actionKind: "*", changeRisk: "*", minAutonomy: "merge" })).toBe(2);
    expect(requiredLevelInt({ actionKind: "*", changeRisk: "*", minAutonomy: "lead" })).toBe(3);
  });
});
