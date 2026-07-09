import { describe, expect, it, vi } from "vitest";

import type { CozntClient } from "@/mcp/client";
import { runGetMyContext } from "@/mcp/tools/context/get-my-context";

function mockClient(payload: unknown): CozntClient {
  return {
    get: vi.fn().mockResolvedValue(payload),
  } as unknown as CozntClient;
}

describe("runGetMyContext phase-aware serialization", () => {
  it("returns only project, welcome, currentStage in Requirements", async () => {
    const payload = {
      project: { id: "p1", name: "Alpha", slug: "alpha", description: null, url: "/p1", repoUrl: null },
      welcome: { headline: "h", summary: null, nextActions: [] },
      currentStage: "The current project is in the *Requirements* phase.",
      workItem: { key: "WI-1", title: "x", url: null },
      rules: [{ id: "r1", title: "rule", severity: "warning", url: "/r1" }],
      meta: { responseTimeMs: 1, cacheStatus: "miss", computedAt: new Date().toISOString() },
    };

    const result = await runGetMyContext(mockClient(payload), {});
    expect(result).toEqual({
      project: payload.project,
      welcome: payload.welcome,
      currentStage: payload.currentStage,
    });
    expect(Object.keys(result as Record<string, unknown>)).toEqual([
      "project",
      "welcome",
      "currentStage",
    ]);
  });

  it("returns only project, welcome, currentStage in Design", async () => {
    const payload = {
      project: { id: "p2", name: "Beta", slug: "beta", description: null, url: "/p2", repoUrl: null },
      welcome: { headline: "h", summary: null, nextActions: [] },
      currentStage: "The current project is in the *Design* phase.",
      skills: [{ slug: "x", level: "OBSERVE" }],
      projectArtifacts: { plans: { total: 0, byKind: {}, byStatus: {} } },
    };

    const result = await runGetMyContext(mockClient(payload), {});
    expect(result).toEqual({
      project: payload.project,
      welcome: payload.welcome,
      currentStage: payload.currentStage,
    });
  });

  it("preserves full payload in Development and later phases", async () => {
    const payload = {
      project: { id: "p3", name: "Gamma", slug: "gamma", description: null, url: "/p3", repoUrl: null },
      welcome: { headline: "h", summary: null, nextActions: [] },
      currentStage: "The current project is in the *Development* phase.",
      workItem: null,
      rules: [{ id: "r1", title: "rule", severity: "warning", url: "/r1" }],
      skills: [{ slug: "x", level: "OBSERVE" }],
      meta: { responseTimeMs: 1, cacheStatus: "miss", computedAt: new Date().toISOString() },
    };

    const result = await runGetMyContext(mockClient(payload), {});
    expect(result).toMatchObject(payload);
    expect((result as Record<string, unknown>).rules).toBeDefined();
  });

  it("does not misclassify Development when message text contains the word design", async () => {
    const payload = {
      project: { id: "p4", name: "Delta", slug: "delta", description: null, url: "/p4", repoUrl: null },
      welcome: { headline: "h", summary: null, nextActions: [] },
      currentStage:
        "The current project is in the *Development* phase. You may now write code and use any tools you need to implement the approved design.",
      rules: [{ id: "r1", title: "rule", severity: "warning", url: "/r1" }],
      meta: { responseTimeMs: 1, cacheStatus: "miss", computedAt: new Date().toISOString() },
    };

    const result = await runGetMyContext(mockClient(payload), {});
    expect(result).toMatchObject(payload);
    expect((result as Record<string, unknown>).rules).toBeDefined();
  });
});
