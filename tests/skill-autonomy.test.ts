/**
 * Progressive autonomy ledger — promotion / demotion rules.
 *
 * Tests the pure decision logic in `recomputeSkillAutonomy()` by mocking
 * `@/db/client`. We don't exercise SQL — that's covered indirectly by the
 * Drizzle migration + the data shape of the schema files.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- mock db ----------------------------------------------------------
//
// We capture inserts to `skill_autonomy` so the assertions can read the
// upserted level + reason. Reads return canned data we set per-test.

interface Outcome {
  verdict: "success" | "rolled_back" | "incident";
  severity?: "low" | "high" | "critical" | null;
}

interface AutonomyRow {
  skillId: string;
  organizationId: string;
  level: number;
  levelSetAt: Date;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  lastReason: string | null;
}

const state = {
  outcomes: [] as Outcome[],
  autonomyRow: null as AutonomyRow | null,
  skillExists: true,
  upsertCalls: [] as AutonomyRow[],
};

vi.mock("@/db/client", () => {
  const db = {
    query: {
      skills: {
        findFirst: vi.fn(async () =>
          state.skillExists ? { id: "skill-1", organizationId: "org-1" } : undefined,
        ),
      },
      skillOutcomes: {
        findFirst: vi.fn(async () => undefined),
      },
      skillAutonomy: {
        findFirst: vi.fn(async () => state.autonomyRow ?? undefined),
      },
    },
    select: vi.fn(() => ({
      from: () => ({
        where: async () => state.outcomes,
      }),
    })),
    insert: vi.fn((table: { _?: { name?: string } } | unknown) => {
      const tableName = String((table as { _?: { name?: string } })?._?.name ?? "");
      return {
        values: (vals: AutonomyRow | AutonomyRow[]) => {
          const row = Array.isArray(vals) ? vals[0] : vals;
          return {
            onConflictDoUpdate: ({ set }: { set: Partial<AutonomyRow> }) => {
              // For autonomy table, capture the resulting state.
              if (tableName.includes("autonomy") || row.skillId !== undefined) {
                state.upsertCalls.push({ ...(row as AutonomyRow), ...set } as AutonomyRow);
                state.autonomyRow = { ...(row as AutonomyRow), ...set } as AutonomyRow;
              }
              return Promise.resolve();
            },
            returning: async () => [row],
          };
        },
      };
    }),
  };
  return { db };
});

// Import after mock.
import { recomputeSkillAutonomy, getSkillAutonomy, LEVEL_NAMES } from "@/operations/skill/skill-autonomy";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  state.outcomes = [];
  state.autonomyRow = null;
  state.skillExists = true;
  state.upsertCalls = [];
});

describe("getSkillAutonomy", () => {
  it("returns level 0 (intern) default when no row exists", async () => {
    state.autonomyRow = null;
    const s = await getSkillAutonomy("skill-1", null);
    expect(s.level).toBe(0);
    expect(s.levelName).toBe("observe");
    expect(s.lastReviewedAt).toBeNull();
  });
});

describe("recomputeSkillAutonomy", () => {
  it("promotes a junior with high success rate, enough samples, and enough time at level", async () => {
    // At level 1 for 20 days.
    state.autonomyRow = {
      skillId: "skill-1",
      organizationId: "org-1",
      level: 1,
      levelSetAt: new Date(Date.now() - 20 * DAY_MS),
      lastReviewedAt: null,
      nextReviewAt: null,
      lastReason: null,
    };
    // 19 successes, 1 rollback → 95% success rate, 20 samples.
    state.outcomes = [
      ...Array.from({ length: 19 }, () => ({ verdict: "success" as const })),
      { verdict: "rolled_back" as const },
    ];

    const result = await recomputeSkillAutonomy("skill-1", null);
    expect(result.promoted).toBe(true);
    expect(result.level).toBe(2);
    expect(result.levelName).toBe("merge");
    expect(state.autonomyRow?.level).toBe(2);
  });

  it("does NOT promote when window time at level is insufficient", async () => {
    state.autonomyRow = {
      skillId: "skill-1",
      organizationId: "org-1",
      level: 1,
      levelSetAt: new Date(Date.now() - 3 * DAY_MS), // only 3 days
      lastReviewedAt: null,
      nextReviewAt: null,
      lastReason: null,
    };
    state.outcomes = Array.from({ length: 20 }, () => ({ verdict: "success" as const }));

    const result = await recomputeSkillAutonomy("skill-1", null);
    expect(result.promoted).toBe(false);
    expect(result.level).toBe(1);
    expect(result.reason).toMatch(/holding at propose/);
  });

  it("demotes immediately to level 0 on a critical incident regardless of history", async () => {
    state.autonomyRow = {
      skillId: "skill-1",
      organizationId: "org-1",
      level: 3, // principal
      levelSetAt: new Date(Date.now() - 90 * DAY_MS),
      lastReviewedAt: null,
      nextReviewAt: null,
      lastReason: null,
    };
    state.outcomes = [
      ...Array.from({ length: 50 }, () => ({ verdict: "success" as const })),
      { verdict: "incident" as const, severity: "critical" as const },
    ];

    const result = await recomputeSkillAutonomy("skill-1", null);
    expect(result.demoted).toBe(true);
    expect(result.level).toBe(0);
    expect(result.reason).toMatch(/critical incident/);
  });

  it("treats a brand-new skill as level 0 with no history", async () => {
    state.autonomyRow = null;
    state.outcomes = []; // no outcomes yet
    const result = await recomputeSkillAutonomy("skill-1", null);
    // Default level 0; no demotion, no promotion (level cap on bottom).
    expect(result.level).toBe(0);
    expect(result.promoted).toBe(false);
    expect(result.demoted).toBe(false);
    expect(LEVEL_NAMES[result.level]).toBe("observe");
  });
});
