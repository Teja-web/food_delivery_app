/**
 * Skill-attribution parser tests — covers the commit-trailer / PR-body
 * conventions and the revert-detection helper.
 */

import { describe, expect, it } from "vitest";

import {
  attributeSkill,
  detectRevert,
  parseSkillSlug,
} from "@/lib/integrations/skill-attribution";

describe("parseSkillSlug", () => {
  it("matches a Made-by trailer (case-insensitive)", () => {
    expect(parseSkillSlug("fix: bug\n\nMade-by: frontend-test-author")).toBe(
      "frontend-test-author",
    );
    expect(parseSkillSlug("made-by: docs-updater")).toBe("docs-updater");
  });

  it("matches the alternative coznt-skill trailer", () => {
    expect(parseSkillSlug("title\n\ncoznt-skill: schema-migration-reviewer")).toBe(
      "schema-migration-reviewer",
    );
  });

  it("returns null on missing or empty input", () => {
    expect(parseSkillSlug(null)).toBeNull();
    expect(parseSkillSlug(undefined)).toBeNull();
    expect(parseSkillSlug("")).toBeNull();
    expect(parseSkillSlug("regular commit message")).toBeNull();
  });

  it("downcases the slug", () => {
    expect(parseSkillSlug("Made-By: Mixed-Case-Skill")).toBe("mixed-case-skill");
  });
});

describe("attributeSkill", () => {
  it("returns the trailer on the first commit that has one", () => {
    const slug = attributeSkill(
      [
        { message: "fix\n\nMade-by: skill-a" },
        { message: "wip\n\nMade-by: skill-b" },
      ],
      null,
    );
    expect(slug).toBe("skill-a");
  });

  it("falls back to PR body when no commit has a trailer", () => {
    const slug = attributeSkill(
      [{ message: "fix" }, { message: "wip" }],
      "body text\n\nMade-by: pr-body-skill",
    );
    expect(slug).toBe("pr-body-skill");
  });

  it("returns null when neither source has a trailer", () => {
    expect(attributeSkill([{ message: "fix" }], "no trailer here")).toBeNull();
  });
});

describe("detectRevert", () => {
  it("detects a revert PR from title + body", () => {
    const r = detectRevert(
      `Revert "feat: rolling deploy support"`,
      "This reverts commit deadbeefcafe1234567890abcdef0123456789ab.",
    );
    expect(r).not.toBeNull();
    expect(r!.originalSha).toBe("deadbeefcafe1234567890abcdef0123456789ab");
    expect(r!.originalTitle).toBe("feat: rolling deploy support");
  });

  it("returns title-only signal when the body has no SHA", () => {
    const r = detectRevert(`Revert "feat: x"`, "Just reverting, sorry.");
    expect(r).not.toBeNull();
    expect(r!.originalSha).toBeNull();
    expect(r!.originalTitle).toBe("feat: x");
  });

  it("returns sha-only signal when title isn't in Revert format", () => {
    const r = detectRevert(
      "Roll back the feature flag",
      "This reverts commit 1234567 — the canary regressed.",
    );
    expect(r).not.toBeNull();
    expect(r!.originalSha).toBe("1234567");
    expect(r!.originalTitle).toBeNull();
  });

  it("returns null when neither pattern matches", () => {
    expect(detectRevert("feat: something new", "Just a normal PR body.")).toBeNull();
  });

  it("ignores nullish inputs", () => {
    expect(detectRevert(null, null)).toBeNull();
    expect(detectRevert(undefined, undefined)).toBeNull();
  });
});
