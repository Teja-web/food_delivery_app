/**
 * canonicalizeRemote — collapse SSH/HTTPS variants of the same git
 * remote into one key. Table-tested against real-world URL forms.
 */

import { describe, expect, it } from "vitest";

import { canonicalizeRemote } from "@/domain/git-remote";

describe("canonicalizeRemote", () => {
  const cases: { input: string; expected: string }[] = [
    { input: "https://github.com/foo/bar.git", expected: "github.com/foo/bar" },
    { input: "https://github.com/foo/bar", expected: "github.com/foo/bar" },
    { input: "git@github.com:foo/bar.git", expected: "github.com/foo/bar" },
    { input: "git@github.com:foo/bar", expected: "github.com/foo/bar" },
    {
      input: "https://github.com/foo/bar/",
      expected: "github.com/foo/bar",
    },
    {
      input: "https://USER:TOKEN@github.com/foo/bar.git",
      expected: "github.com/foo/bar",
    },
    {
      input: "ssh://git@gitlab.acme.internal:22/foo/bar.git",
      expected: "gitlab.acme.internal/foo/bar",
    },
    {
      input: "  https://GitHub.com/Foo/Bar.git  ",
      expected: "github.com/Foo/Bar", // host lowercased, path case preserved
    },
    {
      input: "ssh://git@github.com/foo/bar.git",
      expected: "github.com/foo/bar",
    },
  ];

  for (const { input, expected } of cases) {
    it(`${input} → ${expected}`, () => {
      expect(canonicalizeRemote(input)).toBe(expected);
    });
  }

  it("HTTPS and SSH variants of the same remote produce identical canonical forms", () => {
    const https = canonicalizeRemote("https://github.com/foo/bar.git");
    const ssh = canonicalizeRemote("git@github.com:foo/bar.git");
    expect(https).toBe(ssh);
  });

  it("preserves nested path segments", () => {
    expect(canonicalizeRemote("https://gitlab.com/group/sub/repo.git")).toBe(
      "gitlab.com/group/sub/repo",
    );
  });
});
