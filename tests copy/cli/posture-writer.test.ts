/**
 * Posture-file fan-out — verify AGENTS.md is always written, editor-native
 * files are conditional, managed blocks are idempotent, and user content
 * outside the markers is preserved across re-runs.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  writePostureFiles,
  POSTURE_START,
  POSTURE_END,
} from "@/cli/lib/posture-writer";

let tmpRoot = "";

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "coznt-posture-test-"));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("writePostureFiles — AGENTS.md", () => {
  it("always writes AGENTS.md regardless of editor", () => {
    for (const editor of ["claude-code", "cursor", "zed", "codex", "opencode"] as const) {
      const dir = mkdtempSync(join(tmpdir(), "coznt-agents-"));
      try {
        writePostureFiles(dir, editor);
        const content = readFileSync(join(dir, "AGENTS.md"), "utf8");
        expect(content).toContain(POSTURE_START);
        expect(content).toContain(POSTURE_END);
        expect(content).toContain("Coznt governance");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });
});

describe("writePostureFiles — editor-conditional files", () => {
  it("writes CLAUDE.md only for claude-code", () => {
    writePostureFiles(tmpRoot, "claude-code");
    expect(existsSync(join(tmpRoot, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(tmpRoot, ".cursor/rules/coznt.mdc"))).toBe(false);
    expect(existsSync(join(tmpRoot, ".rules"))).toBe(false);
  });

  it("writes .cursor/rules/coznt.mdc only for cursor", () => {
    writePostureFiles(tmpRoot, "cursor");
    expect(existsSync(join(tmpRoot, "CLAUDE.md"))).toBe(false);
    const mdc = readFileSync(join(tmpRoot, ".cursor/rules/coznt.mdc"), "utf8");
    expect(mdc).toContain("alwaysApply: true");
    expect(mdc).toContain("description: Coznt governance posture");
    expect(mdc).toContain(POSTURE_START);
  });

  it("writes .rules only for zed", () => {
    writePostureFiles(tmpRoot, "zed");
    expect(existsSync(join(tmpRoot, ".rules"))).toBe(true);
    expect(existsSync(join(tmpRoot, "CLAUDE.md"))).toBe(false);
  });

  it("writes only AGENTS.md for editors without a native rules file", () => {
    writePostureFiles(tmpRoot, "codex");
    expect(existsSync(join(tmpRoot, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(tmpRoot, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(tmpRoot, ".rules"))).toBe(false);
  });
});

describe("writePostureFiles — idempotent managed block", () => {
  it("preserves user content outside the markers on re-run", () => {
    const claudePath = join(tmpRoot, "CLAUDE.md");
    const userContent = "# My Project\n\nSome existing notes that pre-date coznt.\n";
    writeFileSync(claudePath, userContent, "utf8");

    writePostureFiles(tmpRoot, "claude-code");
    const afterFirst = readFileSync(claudePath, "utf8");
    expect(afterFirst.startsWith(userContent.trimEnd())).toBe(true);
    expect(afterFirst).toContain(POSTURE_START);

    writePostureFiles(tmpRoot, "claude-code");
    const afterSecond = readFileSync(claudePath, "utf8");

    expect(afterSecond.startsWith(userContent.trimEnd())).toBe(true);

    const occurrences = afterSecond.split(POSTURE_START).length - 1;
    expect(occurrences).toBe(1);
  });

  it("replaces existing managed block content without duplicating it", () => {
    const claudePath = join(tmpRoot, "CLAUDE.md");
    const seeded = [
      "# Project",
      "",
      POSTURE_START,
      "OUTDATED POSTURE TEXT",
      POSTURE_END,
      "",
      "## Post-block user notes",
    ].join("\n");
    writeFileSync(claudePath, seeded, "utf8");

    writePostureFiles(tmpRoot, "claude-code");
    const updated = readFileSync(claudePath, "utf8");

    expect(updated).not.toContain("OUTDATED POSTURE TEXT");
    expect(updated).toContain("# Project");
    expect(updated).toContain("## Post-block user notes");
    expect(updated.split(POSTURE_START).length - 1).toBe(1);
  });

  it("reports changed=false on a second invocation with no content drift", () => {
    const first = writePostureFiles(tmpRoot, "claude-code");
    expect(first.every((r) => r.changed)).toBe(true);

    const second = writePostureFiles(tmpRoot, "claude-code");
    expect(second.every((r) => r.changed === false)).toBe(true);
  });
});

describe("writePostureFiles — content discipline", () => {
  it("mentions get_my_context, forbidden actions, and the .coznt directory", () => {
    writePostureFiles(tmpRoot, "claude-code");
    const claude = readFileSync(join(tmpRoot, "CLAUDE.md"), "utf8");
    expect(claude).toContain("get_my_context");
    expect(claude).toContain("project-task");
    expect(claude).toContain(".coznt");
    expect(claude).toContain(".mcp.json");
  });

  it("creates parent directories for nested files like .cursor/rules/", () => {
    writePostureFiles(tmpRoot, "cursor");
    expect(existsSync(join(tmpRoot, ".cursor", "rules"))).toBe(true);
  });

  it("does not clobber other cursor rule files in .cursor/rules/", () => {
    const otherPath = join(tmpRoot, ".cursor", "rules", "team-style.mdc");
    mkdirSync(join(tmpRoot, ".cursor", "rules"), { recursive: true });
    writeFileSync(otherPath, "team rule content", "utf8");

    writePostureFiles(tmpRoot, "cursor");
    expect(readFileSync(otherPath, "utf8")).toBe("team rule content");
    expect(existsSync(join(tmpRoot, ".cursor", "rules", "coznt.mdc"))).toBe(true);
  });
});
