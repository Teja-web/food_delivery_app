import { describe, expect, it } from "vitest";
import { evaluateActionPolicy, __test, type ActionPolicyConfig } from "./action-policy";

const ruleMeta = { id: "r1", title: "no-force-push", severity: "error" as const };

function policy(partial: Partial<ActionPolicyConfig>): ActionPolicyConfig {
  return { validator: "action-policy", ...partial };
}

describe("evaluateActionPolicy", () => {
  it("returns null when the proposed action matches no constraint", () => {
    const v = evaluateActionPolicy(
      ruleMeta,
      policy({ blockedActions: ["rm -rf*"], maxFilesPerChange: 10 }),
      { command: "build", paths: ["src/index.ts"], fileCount: 2, hasTests: true },
    );
    expect(v).toBeNull();
  });

  it("blocks an action whose command matches a glob in blockedActions", () => {
    const v = evaluateActionPolicy(
      ruleMeta,
      policy({ blockedActions: ["*--force*", "rm -rf*"] }),
      { command: "git push --force origin main" },
    );
    expect(v).not.toBeNull();
    expect(v!.severity).toBe("error");
    expect(v!.message).toContain("blocked by pattern");
    expect(v!.message).toContain("*--force*");
  });

  it("blocks paths matching a glob in blockedPaths", () => {
    const v = evaluateActionPolicy(
      ruleMeta,
      policy({ blockedPaths: [".github/**", ".ai-sdlc/**"] }),
      { paths: ["src/ok.ts", ".github/workflows/ci.yml"] },
    );
    expect(v).not.toBeNull();
    expect(v!.message).toContain(".github/workflows/ci.yml");
    expect(v!.message).toContain(".github/**");
    // Non-matching path should not appear as offending.
    expect(v!.message).not.toContain("src/ok.ts (matches");
  });

  it("flags requireTests=true when hasTests is explicitly false", () => {
    const v = evaluateActionPolicy(
      ruleMeta,
      policy({ requireTests: true }),
      { hasTests: false },
    );
    expect(v).not.toBeNull();
    expect(v!.message).toContain("requires tests");
  });

  it("does NOT flag requireTests when hasTests is unknown (undefined)", () => {
    const v = evaluateActionPolicy(
      ruleMeta,
      policy({ requireTests: true }),
      { command: "format" },
    );
    expect(v).toBeNull();
  });

  it("flags when fileCount exceeds maxFilesPerChange", () => {
    const v = evaluateActionPolicy(
      ruleMeta,
      policy({ maxFilesPerChange: 5 }),
      { fileCount: 17 },
    );
    expect(v).not.toBeNull();
    expect(v!.message).toMatch(/fileCount 17 exceeds max 5/);
  });

  it("collapses multiple violations into one message", () => {
    const v = evaluateActionPolicy(
      ruleMeta,
      policy({
        blockedActions: ["rm -rf*"],
        maxFilesPerChange: 1,
      }),
      { command: "rm -rf node_modules", fileCount: 99 },
    );
    expect(v).not.toBeNull();
    expect(v!.message).toContain("blocked by pattern");
    expect(v!.message).toContain("exceeds max");
  });

  it("returns null when policy has constraints but action supplies nothing relevant", () => {
    const v = evaluateActionPolicy(
      ruleMeta,
      policy({ blockedActions: ["rm -rf*"], blockedPaths: [".github/**"] }),
      {}, // empty proposed action
    );
    expect(v).toBeNull();
  });

  it("propagates rule severity into the violation", () => {
    const v = evaluateActionPolicy(
      { id: "r-warn", title: "soft-warn", severity: "warn" },
      policy({ blockedActions: ["foo*"] }),
      { command: "foobar" },
    );
    expect(v!.severity).toBe("warn");
  });
});

describe("globToRegExp (internal)", () => {
  const { globToRegExp } = __test;

  it("* does not cross path separators", () => {
    expect(globToRegExp("src/*.ts").test("src/index.ts")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/sub/index.ts")).toBe(false);
  });

  it("** crosses path separators", () => {
    expect(globToRegExp(".github/**").test(".github/workflows/ci.yml")).toBe(true);
    expect(globToRegExp(".github/**").test(".github/")).toBe(true);
  });

  it("escapes regex metacharacters", () => {
    expect(globToRegExp("a.b").test("a.b")).toBe(true);
    expect(globToRegExp("a.b").test("axb")).toBe(false);
  });

  it("anchors the pattern (no implicit substring match)", () => {
    expect(globToRegExp("rm -rf").test("git rm -rf node_modules")).toBe(false);
    expect(globToRegExp("*rm -rf*").test("git rm -rf node_modules")).toBe(true);
  });
});
