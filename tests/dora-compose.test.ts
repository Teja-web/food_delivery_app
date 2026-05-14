/**
 * Pure-math tests for the DORA composition helpers. The full
 * `computeProjectDora` path requires the metrics table; the smoke harness
 * covers that. These tests pin the math: bucketing, half-window deltas,
 * and the trend-direction heuristic.
 */

import { describe, expect, it } from "vitest";

import { _internals } from "@/operations/dora-compose";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-05-14T12:00:00Z");

function row(daysAgo: number, type: "lead_time" | "deployment_frequency" | "change_failure_rate", value: number) {
  return { type: type as never, value, recordedAt: new Date(NOW.getTime() - daysAgo * DAY) };
}

describe("dora-compose internals", () => {
  describe("bucketByDay", () => {
    it("buckets matching-type rows into the correct day, sums values", () => {
      const rows = [
        row(0, "deployment_frequency", 1),
        row(0, "deployment_frequency", 1),
        row(5, "deployment_frequency", 1),
        row(5, "lead_time", 12), // wrong type — excluded
        row(35, "deployment_frequency", 1), // outside 30d window — excluded
      ];
      const out = _internals.bucketByDay(rows, "deployment_frequency", 30, NOW);
      expect(out.length).toBe(30);
      // Window: days 29..0 from oldest→newest. 5-days-ago is idx 24; today idx 29.
      expect(out[29]).toBe(2);
      expect(out[24]).toBe(1);
      expect(out.reduce((a, b) => a + b, 0)).toBe(3);
    });
  });

  describe("meanByDay", () => {
    it("averages values per day, leaves empty days at 0", () => {
      const rows = [
        row(0, "lead_time", 24),
        row(0, "lead_time", 48),
        row(5, "lead_time", 12),
      ];
      const out = _internals.meanByDay(rows, "lead_time", 30, NOW);
      expect(out[29]).toBe(36);
      expect(out[24]).toBe(12);
      expect(out[10]).toBe(0);
    });
  });

  describe("halfWindowDelta", () => {
    it("sum aggregator: compares totals of the two halves", () => {
      const buckets = [1, 1, 1, 1, 5, 5, 5, 5];
      const r = _internals.halfWindowDelta(buckets, "sum");
      expect(r.prev).toBe(4);
      expect(r.curr).toBe(20);
      expect(r.delta).toBe(16);
    });

    it("mean aggregator: averages only populated days", () => {
      const buckets = [0, 0, 10, 0, 0, 0, 30, 0];
      const r = _internals.halfWindowDelta(buckets, "mean");
      expect(r.prev).toBe(10);
      expect(r.curr).toBe(30);
      expect(r.delta).toBe(20);
    });

    it("returns nulls when a half has no populated days (mean) or no buckets", () => {
      const r = _internals.halfWindowDelta([0, 0, 0, 0, 5, 5, 5, 5], "mean");
      expect(r.prev).toBeNull();
      expect(r.curr).not.toBeNull();
      expect(r.delta).toBeNull();
    });
  });

  describe("trendDirection", () => {
    it("for lower-is-better metrics, lower current = up (improving)", () => {
      expect(_internals.trendDirection(20, 10, true)).toBe("up");
      expect(_internals.trendDirection(10, 20, true)).toBe("down");
    });

    it("for higher-is-better metrics, higher current = up (improving)", () => {
      expect(_internals.trendDirection(10, 20, false)).toBe("up");
      expect(_internals.trendDirection(20, 10, false)).toBe("down");
    });

    it("equal or null inputs return flat", () => {
      expect(_internals.trendDirection(10, 10, true)).toBe("flat");
      expect(_internals.trendDirection(null, 10, true)).toBe("flat");
      expect(_internals.trendDirection(10, null, true)).toBe("flat");
    });
  });
});
