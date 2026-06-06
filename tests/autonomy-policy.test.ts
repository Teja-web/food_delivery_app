/**
 * `autonomy-threshold` rule validator — frontmatter parsing + rule matching.
 *
 * The DB-resolver `resolveAutonomyThreshold` and the runtime tool-event
 * gate live elsewhere and are exercised via integration tests.
 */

import { describe, expect, it } from "vitest";

import {
  parseAutonomyThresholdConfig,
  ruleMatches,
  requiredLevelInt,
  type AutonomyThresholdConfig,
} from "@/domain/rule-validators/autonomy-threshold";

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
