/**
 * Milestone-D PreToolUse gate — decision logic.
 *
 * The hot path is: rule check → autonomy check → maybe open a
 * `skill_invocation` approval → write `automation_log`. The actual SQL is
 * mocked; we're pinning the verdict, the reason composition, and the
 * approval-routing behavior.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

interface Skill {
  id: string;
  slug: string;
  name: string;
  organizationId: string;
  projectId: string | null;
  minAutonomyLevel: number;
  enabled: boolean;
}

interface RuleViolation {
  ruleId: string;
  ruleTitle: string;
  severity: "error" | "warn" | "info";
  message: string;
}

const state = {
  skill: null as Skill | null,
  autonomyByProject: new Map<string, { level: number; levelName: string }>(),
  ruleViolations: [] as RuleViolation[],
  approvalInserts: [] as Record<string, unknown>[],
  automationLogInserts: [] as Record<string, unknown>[],
};

vi.mock("@/db/client", () => {
  const db = {
    query: {
      skills: {
        findFirst: vi.fn(async () => state.skill ?? undefined),
      },
    },
    insert: vi.fn(() => {
      return {
        values: (vals: Record<string, unknown>) => {
          const row = { id: `row_${Math.random().toString(36).slice(2, 8)}`, ...vals };
          // Disambiguate by row shape — drizzle's table-name private symbols
          // are unreliable to read from outside.
          if (vals.entityType === "skill_invocation") state.approvalInserts.push(row);
          else if (typeof vals.taskId === "string" && (vals.taskId as string).startsWith("pre-tool-use:")) {
            state.automationLogInserts.push(row);
          }
          return {
            returning: async () => [row],
            onConflictDoUpdate: () => Promise.resolve(),
          };
        },
      };
    }),
  };
  return { db };
});

vi.mock("@/operations/rule-engine", () => ({
  applyActionPolicyRules: vi.fn(async () => state.ruleViolations),
}));

vi.mock("@/operations/skill/skill-autonomy", () => ({
  LEVEL_NAMES: ["observe", "propose", "merge", "lead"] as const,
  getSkillAutonomy: vi.fn(async (skillId: string, projectId: string | null) => {
    const key = `${skillId}:${projectId ?? "null"}`;
    return state.autonomyByProject.get(key) ?? { level: 0, levelName: "observe" as const };
  }),
  recordSkillOutcome: vi.fn(async () => ({ id: "outcome_x" })),
}));

vi.mock("@/lib/safe-revalidate", () => ({ safeRevalidate: vi.fn() }));

// IMPORTANT: import after mocks so the handler picks up our stubs.
import { handlePreToolUse } from "@/operations/tool-events";
import type { ApiContext } from "@/lib/auth/api-key";

const ctx: ApiContext = {
  organizationId: "org_1",
  projectId: "proj_1",
  apiKeyId: "key_1",
  scopes: ["pre-tool-use"],
} as unknown as ApiContext;

function setSkill(min: number, level: number): Skill {
  const skill: Skill = {
    id: "skill_crc",
    slug: "change-risk-classifier",
    name: "Change Risk Classifier",
    organizationId: "org_1",
    projectId: null,
    minAutonomyLevel: min,
    enabled: true,
  };
  state.skill = skill;
  state.autonomyByProject.set(`${skill.id}:proj_1`, {
    level,
    levelName: ["observe", "propose", "merge", "lead"][level] ?? "observe",
  });
  return skill;
}

beforeEach(() => {
  state.skill = null;
  state.autonomyByProject = new Map();
  state.ruleViolations = [];
  state.approvalInserts = [];
  state.automationLogInserts = [];
});

describe("handlePreToolUse — Milestone-D autonomy gate", () => {
  it("allows when skill level >= required and no rule violations", async () => {
    setSkill(2, 2);
    const res = await handlePreToolUse(ctx, {
      skillSlug: "change-risk-classifier",
      tool: "bash",
      command: "pnpm test",
    });
    expect(res.allowed).toBe(true);
    expect(res.reason).toBeNull();
    expect(res.approvalId).toBeNull();
    expect(res.autonomy).toEqual({ level: 2, levelName: "merge", requiredLevel: 2 });
    expect(state.approvalInserts).toHaveLength(0);
    expect(state.automationLogInserts).toHaveLength(1);
    expect(state.automationLogInserts[0].status).toBe("succeeded");
  });

  it("blocks via autonomy and opens a skill_invocation approval", async () => {
    setSkill(2, 0);
    const res = await handlePreToolUse(ctx, {
      skillSlug: "change-risk-classifier",
      tool: "edit",
      command: "src/payments/capture.ts",
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/autonomy_gate.*level 0.*2 required/);
    expect(res.approvalId).not.toBeNull();
    expect(res.autonomy?.requiredLevel).toBe(2);
    expect(state.approvalInserts).toHaveLength(1);
    expect(state.approvalInserts[0].entityType).toBe("skill_invocation");
    expect(state.approvalInserts[0].projectId).toBe("proj_1");
    expect(state.approvalInserts[0].requestedById).toBe("agent:change-risk-classifier");
  });

  it("blocks via rule violation regardless of autonomy", async () => {
    setSkill(0, 3);
    state.ruleViolations = [
      {
        ruleId: "r_blocked_action",
        ruleTitle: "no-force-push",
        severity: "error",
        message: "force-push to main blocked",
      },
    ];
    const res = await handlePreToolUse(ctx, {
      skillSlug: "change-risk-classifier",
      tool: "bash",
      command: "git push --force origin main",
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("no-force-push");
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].ruleId).toBe("r_blocked_action");
    // Autonomy was sufficient — no approval opened (only autonomy-gated blocks route).
    expect(res.approvalId).toBeNull();
    expect(state.approvalInserts).toHaveLength(0);
  });

  it("composes the reason when both rule and autonomy block", async () => {
    setSkill(2, 0);
    state.ruleViolations = [
      {
        ruleId: "r_blocked_path",
        ruleTitle: "auth-paths-locked",
        severity: "error",
        message: "src/auth/** is locked",
      },
    ];
    const res = await handlePreToolUse(ctx, {
      skillSlug: "change-risk-classifier",
      tool: "edit",
      paths: ["src/auth/middleware.ts"],
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("auth-paths-locked");
    expect(res.reason).toContain("autonomy_gate");
    // Autonomy still routes its own approval even if a rule also blocked.
    expect(res.approvalId).not.toBeNull();
  });

  it("ignores warn-severity rule violations for the allow decision", async () => {
    setSkill(0, 0);
    state.ruleViolations = [
      {
        ruleId: "r_warn",
        ruleTitle: "missing-tests",
        severity: "warn",
        message: "no test file accompanying change",
      },
    ];
    const res = await handlePreToolUse(ctx, {
      skillSlug: "change-risk-classifier",
      tool: "edit",
      hasTests: false,
    });
    expect(res.allowed).toBe(true);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].severity).toBe("warn");
    expect(res.reason).toBeNull();
  });

  it("returns null autonomy when the skill is unknown but does not crash", async () => {
    state.skill = null;
    const res = await handlePreToolUse(ctx, {
      skillSlug: "unregistered-skill",
      tool: "bash",
      command: "echo hi",
    });
    expect(res.autonomy).toBeNull();
    // No skill → no autonomy gate → no rule violations → allowed.
    expect(res.allowed).toBe(true);
    expect(res.approvalId).toBeNull();
    expect(res.skillId).toBeNull();
  });

  it("writes one automation_log row per call", async () => {
    setSkill(0, 0);
    await handlePreToolUse(ctx, {
      skillSlug: "change-risk-classifier",
      tool: "bash",
      command: "ls",
    });
    expect(state.automationLogInserts).toHaveLength(1);
    expect(state.automationLogInserts[0].taskId).toBe("pre-tool-use:bash");
    expect(state.automationLogInserts[0].actorType).toBe("agent");
    expect(state.automationLogInserts[0].entityType).toBe("skill");
  });
});
