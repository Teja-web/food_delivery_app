/**
 * `computeAutonomyDistance` — table-test the promotion / demotion
 * distance signal. Pure-function tests; no DB.
 */

import { describe, expect, it } from "vitest";

import { computeAutonomyDistance } from "@/domain/autonomy-distance";

const baseStats = {
  total: 0,
  successes: 0,
  rollbacks: 0,
  incidents: 0,
  criticalIncidents: 0,
};

describe("computeAutonomyDistance", () => {
  it("returns demotion-pending when a critical incident lands at any non-zero level", () => {
    const d = computeAutonomyDistance({
      level: 2,
      daysAtLevel: 30,
      windowStats: { ...baseStats, total: 10, successes: 9, incidents: 1, criticalIncidents: 1 },
    });
    expect(d.kind).toBe("demotion-pending");
    expect(d.label).toMatch(/Demotion/);
  });

  it("a critical incident at observe (level 0) does NOT trigger demotion-pending", () => {
    // The recompute logic only demotes when level > MIN_LEVEL.
    const d = computeAutonomyDistance({
      level: 0,
      daysAtLevel: 30,
      windowStats: { ...baseStats, total: 3, successes: 2, incidents: 1, criticalIncidents: 1 },
    });
    expect(d.kind).not.toBe("demotion-pending");
  });

  it("returns at-top when already lead", () => {
    const d = computeAutonomyDistance({
      level: 3,
      daysAtLevel: 60,
      windowStats: { ...baseStats, total: 100, successes: 100 },
    });
    expect(d.kind).toBe("at-top");
  });

  it("returns needs-samples when total invocations < 5", () => {
    const d = computeAutonomyDistance({
      level: 1,
      daysAtLevel: 30,
      windowStats: { ...baseStats, total: 2, successes: 2 },
    });
    expect(d.kind).toBe("needs-samples");
    expect(d.label).toMatch(/3 more invocations to merge/);
    expect(d.nextLevel).toBe("merge");
  });

  it("returns needs-clean-runs when success rate is below 0.9", () => {
    // 6 total, 4 successes → 67% rate. Need to push past 90%.
    // (0.9*6 - 4) / 0.1 = (5.4 - 4) / 0.1 = 14 clean runs to bring 4/(6+x) → 18/(20) = 90%.
    const d = computeAutonomyDistance({
      level: 1,
      daysAtLevel: 30,
      windowStats: { ...baseStats, total: 6, successes: 4, rollbacks: 2 },
    });
    expect(d.kind).toBe("needs-clean-runs");
    expect(d.label).toMatch(/clean run.* to lift success rate to merge/);
    expect(d.nextLevel).toBe("merge");
  });

  it("returns needs-time when samples + rate clear but days-at-level < 14", () => {
    const d = computeAutonomyDistance({
      level: 1,
      daysAtLevel: 3,
      windowStats: { ...baseStats, total: 10, successes: 10 },
    });
    expect(d.kind).toBe("needs-time");
    expect(d.label).toMatch(/11d at level remaining to merge/);
  });

  it("returns eligible when all gates clear", () => {
    const d = computeAutonomyDistance({
      level: 1,
      daysAtLevel: 15,
      windowStats: { ...baseStats, total: 10, successes: 10 },
    });
    expect(d.kind).toBe("eligible");
    expect(d.label).toMatch(/Eligible for merge/);
  });

  it("eligible-at-observe advertises propose as the next level", () => {
    const d = computeAutonomyDistance({
      level: 0,
      daysAtLevel: 15,
      windowStats: { ...baseStats, total: 10, successes: 10 },
    });
    expect(d.kind).toBe("eligible");
    expect(d.nextLevel).toBe("propose");
  });

  it("singular grammar at need=1", () => {
    const d = computeAutonomyDistance({
      level: 1,
      daysAtLevel: 30,
      windowStats: { ...baseStats, total: 4, successes: 4 },
    });
    expect(d.kind).toBe("needs-samples");
    expect(d.label).toBe("1 more invocation to merge");
  });
});
