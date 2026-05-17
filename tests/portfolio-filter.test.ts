/**
 * Portfolio autonomy filter chips — pure predicate test.
 *
 * The chip logic lives inside PortfolioTable.tsx (a "use client" component).
 * To keep the predicate testable without rendering React, we re-implement
 * the same matching rules here against the same posture shape. If the
 * client component's logic changes, this file must change too — the same
 * way the existing `decideExecutionGate` table tests track behavior.
 */

import { describe, expect, it } from "vitest";

type FilterKey = "below-merge" | "lead-only" | "recent-incidents";

interface Posture {
  intern: number;
  junior: number;
  senior: number;
  principal: number;
  total: number;
  incidentsLast7d: number;
}

function matches(posture: Posture, active: Set<FilterKey>): boolean {
  if (active.size === 0) return true;
  for (const key of active) {
    if (key === "below-merge") {
      if (posture.intern + posture.junior === 0) return false;
    } else if (key === "lead-only") {
      if (posture.total === 0 || posture.intern + posture.junior + posture.senior !== 0) return false;
    } else if (key === "recent-incidents") {
      if (posture.incidentsLast7d === 0) return false;
    }
  }
  return true;
}

const empty: Posture = {
  intern: 0,
  junior: 0,
  senior: 0,
  principal: 0,
  total: 0,
  incidentsLast7d: 0,
};

describe("portfolio autonomy filters", () => {
  it("no active filters → every project matches", () => {
    expect(matches(empty, new Set())).toBe(true);
    expect(matches({ ...empty, total: 5, principal: 5 }, new Set())).toBe(true);
  });

  it("below-merge: matches a project with at least one Observe or Propose skill", () => {
    expect(
      matches({ ...empty, total: 3, intern: 1, senior: 2 }, new Set(["below-merge"])),
    ).toBe(true);
    expect(
      matches({ ...empty, total: 3, junior: 2, principal: 1 }, new Set(["below-merge"])),
    ).toBe(true);
  });

  it("below-merge: does NOT match a project where every skill is Merge or higher", () => {
    expect(
      matches({ ...empty, total: 3, senior: 2, principal: 1 }, new Set(["below-merge"])),
    ).toBe(false);
  });

  it("lead-only: matches a project where every skill is Lead", () => {
    expect(matches({ ...empty, total: 4, principal: 4 }, new Set(["lead-only"]))).toBe(true);
  });

  it("lead-only: does NOT match a project with any non-Lead skill", () => {
    expect(matches({ ...empty, total: 3, senior: 1, principal: 2 }, new Set(["lead-only"]))).toBe(false);
  });

  it("lead-only: empty project (no skills) does NOT match", () => {
    expect(matches(empty, new Set(["lead-only"]))).toBe(false);
  });

  it("recent-incidents: matches when incidentsLast7d > 0", () => {
    expect(matches({ ...empty, incidentsLast7d: 1 }, new Set(["recent-incidents"]))).toBe(true);
  });

  it("recent-incidents: does NOT match at 0", () => {
    expect(matches(empty, new Set(["recent-incidents"]))).toBe(false);
  });

  it("AND-combines: below-merge AND recent-incidents requires both", () => {
    // Has Junior skill AND a recent incident → match
    expect(
      matches(
        { ...empty, total: 3, junior: 1, senior: 2, incidentsLast7d: 1 },
        new Set(["below-merge", "recent-incidents"]),
      ),
    ).toBe(true);
    // Has Junior skill but no recent incident → no match
    expect(
      matches(
        { ...empty, total: 3, junior: 1, senior: 2, incidentsLast7d: 0 },
        new Set(["below-merge", "recent-incidents"]),
      ),
    ).toBe(false);
    // No below-Merge skills but has recent incident → no match
    expect(
      matches(
        { ...empty, total: 3, senior: 3, incidentsLast7d: 1 },
        new Set(["below-merge", "recent-incidents"]),
      ),
    ).toBe(false);
  });

  it("contradictory filters: below-merge AND lead-only matches nothing", () => {
    expect(
      matches(
        { ...empty, total: 3, junior: 1, principal: 2 },
        new Set(["below-merge", "lead-only"]),
      ),
    ).toBe(false);
  });
});
