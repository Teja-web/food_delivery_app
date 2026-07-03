/**
 * `projectArtifacts` field on get_my_context — schema contract test.
 *
 * Locks the Zod schema shape so downstream consumers (UI, CLI, agents)
 * have a stable interface. The DB-touching gatherer itself is covered
 * by the live smoke against tasklist; this test pins the schema.
 */

import { describe, expect, it } from "vitest";

import { McpProjectArtifactsSchema, McpResponseSchema } from "@/lib/agent-context/schemas";

describe("McpProjectArtifactsSchema", () => {
  it("accepts a fully-populated artifact snapshot", () => {
    const payload = {
      plans: {
        total: 5,
        byKind: { epic: 0, feature: 0, story: 5 },
        byStatus: { draft: 5, approved: 0 },
      },
      approvals: {
        pendingTotal: 2,
        oldestOpenAgeHours: 28,
      },
      gates: {
        total: 3,
        pending: 2,
        passed: 1,
        failed: 0,
        skipped: 0,
      },
      verificationDebt: 18,
    };
    const parsed = McpProjectArtifactsSchema.parse(payload);
    expect(parsed.plans.total).toBe(5);
    expect(parsed.plans.byStatus.draft).toBe(5);
    expect(parsed.approvals.oldestOpenAgeHours).toBe(28);
    expect(parsed.verificationDebt).toBe(18);
  });

  it("accepts null verificationDebt and null oldestOpenAgeHours", () => {
    const parsed = McpProjectArtifactsSchema.parse({
      plans: { total: 0, byKind: {}, byStatus: {} },
      approvals: { pendingTotal: 0, oldestOpenAgeHours: null },
      gates: { total: 0, pending: 0, passed: 0, failed: 0, skipped: 0 },
      verificationDebt: null,
    });
    expect(parsed.approvals.oldestOpenAgeHours).toBeNull();
    expect(parsed.verificationDebt).toBeNull();
  });

  it("rejects negative integer counts", () => {
    expect(() =>
      McpProjectArtifactsSchema.parse({
        plans: { total: -1, byKind: {}, byStatus: {} },
        approvals: { pendingTotal: 0, oldestOpenAgeHours: null },
        gates: { total: 0, pending: 0, passed: 0, failed: 0, skipped: 0 },
        verificationDebt: null,
      }),
    ).toThrow();
  });

  it("McpResponseSchema includes projectArtifacts (not nullable)", () => {
    // projectArtifacts is required on every response — the gatherer
    // returns zeroed defaults rather than null, because consumers
    // should never have to test the field's existence first.
    const shape = McpResponseSchema.shape;
    expect("projectArtifacts" in shape).toBe(true);
    expect(() =>
      shape.projectArtifacts.parse({
        plans: { total: 0, byKind: {}, byStatus: {} },
        approvals: { pendingTotal: 0, oldestOpenAgeHours: null },
        gates: { total: 0, pending: 0, passed: 0, failed: 0, skipped: 0 },
        verificationDebt: null,
      }),
    ).not.toThrow();
  });

  it("McpResponseSchema includes currentStage", () => {
    const shape = McpResponseSchema.shape;
    expect("currentStage" in shape).toBe(true);
    expect(() => shape.currentStage.parse("The current project is in the *Requirements* phase.")).not.toThrow();
  });
});

