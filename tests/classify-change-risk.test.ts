/**
 * Milestone-C first-agent orchestration — `classifyChangeRiskTask`.
 *
 * The task takes a PR snapshot, calls the `change-risk-classifier` agent
 * via `generate()`, persists the classification to `intelligence`, writes
 * an `automation_log` row, and records a `skill_outcomes` ledger entry.
 * Failure path must record an `incident` outcome without throwing.
 *
 * We mock `generate` and `recordSkillOutcome` and capture the DB writes by
 * shape.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

interface IntelligenceRow {
  organizationId: string;
  entityType: string;
  entityId: string;
  kind: string;
  summary: string | null;
  body: string | null;
  data: Record<string, unknown> | null;
}

interface AutomationLogRow {
  taskId: string;
  entityType: string;
  entityId: string;
  status: string;
  errorMessage?: string | null;
}

const state = {
  existingSkill: null as { id: string } | null,
  skillInsertedRows: [] as Array<{ id: string; slug: string }>,
  automationLogs: [] as AutomationLogRow[],
  intelligenceUpserts: [] as IntelligenceRow[],
  outcomeRecords: [] as Array<{ verdict: string; severity?: string | null }>,
  generateBehavior: "ok" as "ok" | "throw",
};

vi.mock("@/db/client", () => {
  const db = {
    query: {
      skills: {
        findFirst: vi.fn(async () => state.existingSkill ?? undefined),
      },
    },
    insert: vi.fn(() => ({
      values: (vals: Record<string, unknown>) => {
        if (typeof vals.taskId === "string" && (vals.taskId as string).startsWith("agent:")) {
          state.automationLogs.push(vals as unknown as AutomationLogRow);
        } else if (typeof vals.slug === "string") {
          const created = { id: `skill_new_${state.skillInsertedRows.length + 1}`, slug: vals.slug as string };
          state.skillInsertedRows.push(created);
          return {
            returning: async () => [created],
            onConflictDoUpdate: () => Promise.resolve(),
          };
        } else if (vals.kind === "change-risk") {
          state.intelligenceUpserts.push(vals as unknown as IntelligenceRow);
        }
        return {
          returning: async () => [{ id: `intel_${state.intelligenceUpserts.length}` }],
          onConflictDoUpdate: ({ set: _set }: { set: Record<string, unknown> }) => ({
            returning: async () => [{ id: `intel_${state.intelligenceUpserts.length}` }],
          }),
        };
      },
    })),
  };
  return { db };
});

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    generate: vi.fn(async () => {
      if (state.generateBehavior === "throw") {
        throw new Error("anthropic 529 overloaded");
      }
      return {
        text: "Medium risk: touches the core handler path with no auth-test coverage delta.",
        object: {
          riskClass: "medium" as const,
          rationale: "Touches core handler path; no auth-test coverage delta in this diff.",
          signals: [
            { kind: "critical_path", evidence: "src/core/handler.ts modified" },
            { kind: "missing_tests", evidence: "no companion test file" },
          ],
          recommendedGates: ["coverage", "security"],
        },
        usage: {
          modelId: "gpt-4o-mini",
          inputTokens: 100,
          outputTokens: 20,
          totalTokens: 120,
          cachedInputTokens: null,
          reasoningTokens: null,
          cacheHit: false,
          estimatedCostUsd: 0.000027,
          pricing: {
            inputUsdPer1M: 0.15,
            cachedInputUsdPer1M: null,
            outputUsdPer1M: 0.60,
            source: "static",
          },
        },
      };
    }),
  };
});

vi.mock("@/operations/skill/skill-autonomy", () => ({
  recordSkillOutcome: vi.fn(async (input: { verdict: string; severity?: string | null }) => {
    state.outcomeRecords.push({ verdict: input.verdict, severity: input.severity ?? null });
    return { id: `outcome_${state.outcomeRecords.length}` };
  }),
}));

// Stub the prompt builder so we don't depend on its formatting. importOriginal
// keeps `changeRiskClassifierPrompt` (used at agent-definition module load)
// while only overriding the context-aware builder.
vi.mock("@/automations/agents/change-risk-classifier/prompt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/automations/agents/change-risk-classifier/prompt")>();
  return {
    ...actual,
    changeRiskClassifierPromptWithContext: vi.fn(() => "PROMPT"),
  };
});

// IMPORTANT: import after mocks.
import { classifyChangeRiskTask, type ClassifyChangeRiskInput } from "@/automations/tasks/classify-change-risk";

function input(overrides: Partial<ClassifyChangeRiskInput> = {}): ClassifyChangeRiskInput {
  return {
    organizationId: "org_1",
    projectId: "proj_sample",
    projectName: "sample-service",
    projectPhase: "development",
    prRef: "github:example-org/sample-service#142",
    prTitle: "feat: bulk priority update",
    prBody: "Implements TASK-12. Bulk update across selected tasks.",
    files: [{ filename: "src/core/handler.ts", additions: 30, deletions: 6 }],
    totalLines: 36,
    criticalPaths: ["src/core/**"],
    productionCriticalPaths: ["src/core/handler.ts"],
    heuristicRisk: "medium",
    activeRules: ["core-idempotency-rule"],
    ...overrides,
  };
}

beforeEach(() => {
  state.existingSkill = null;
  state.skillInsertedRows = [];
  state.automationLogs = [];
  state.intelligenceUpserts = [];
  state.outcomeRecords = [];
  state.generateBehavior = "ok";
});

describe("classifyChangeRiskTask — Milestone-C first agent", () => {
  it("upserts the skill row on first call, then reuses it", async () => {
    const out1 = await classifyChangeRiskTask(input());
    expect(out1).not.toBeNull();
    expect(state.skillInsertedRows).toHaveLength(1);
    expect(state.skillInsertedRows[0].slug).toBe("change-risk-classifier");

    // Second call — existing skill found, no second insert.
    state.existingSkill = { id: state.skillInsertedRows[0].id };
    state.skillInsertedRows = [];
    const out2 = await classifyChangeRiskTask(input());
    expect(out2).not.toBeNull();
    expect(state.skillInsertedRows).toHaveLength(0);
  });

  it("writes a succeeded automation_log + intelligence + success outcome on the happy path", async () => {
    const out = await classifyChangeRiskTask(input());
    expect(out).not.toBeNull();
    expect(out!.classification.riskClass).toBe("medium");

    expect(state.automationLogs).toHaveLength(1);
    expect(state.automationLogs[0].status).toBe("succeeded");
    expect(state.automationLogs[0].taskId).toBe("agent:change-risk-classifier");
    expect(state.automationLogs[0].entityType).toBe("work_item");
    expect(state.automationLogs[0].entityId).toBe("github:example-org/sample-service#142");

    expect(state.intelligenceUpserts).toHaveLength(1);
    expect(state.intelligenceUpserts[0].kind).toBe("change-risk");
    expect(state.intelligenceUpserts[0].entityType).toBe("work_item");
    expect(state.intelligenceUpserts[0].summary).toMatch(/^MEDIUM/);

    expect(state.outcomeRecords).toHaveLength(1);
    expect(state.outcomeRecords[0].verdict).toBe("success");
  });

  it("on generate() failure: returns null, writes failed log, and records incident outcome", async () => {
    state.generateBehavior = "throw";

    const out = await classifyChangeRiskTask(input());
    expect(out).toBeNull();

    expect(state.automationLogs).toHaveLength(1);
    expect(state.automationLogs[0].status).toBe("failed");
    expect(state.automationLogs[0].errorMessage).toContain("529 overloaded");

    // No intelligence row written on failure.
    expect(state.intelligenceUpserts).toHaveLength(0);

    // Ledger captures incident with high severity per the agent's contract.
    expect(state.outcomeRecords).toHaveLength(1);
    expect(state.outcomeRecords[0].verdict).toBe("incident");
    expect(state.outcomeRecords[0].severity).toBe("high");
  });

  it("never throws — failure isolation contract from process-webhook-event", async () => {
    state.generateBehavior = "throw";
    await expect(classifyChangeRiskTask(input())).resolves.not.toThrow();
  });
});
