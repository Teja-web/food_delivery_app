/**
 * `coznt sync` — exercise the orchestration end-to-end against:
 *   - a tmp repo root (so config + skills + locks don't pollute the working copy)
 *   - a stubbed fetch (so we don't need a running server)
 *
 * Covers: fresh sync, no-op when locks match, drift detection.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sha256 } from "@/cli/lib/hashing";
import { writeConfig } from "@/cli/lib/config";
import { runSync } from "@/cli/commands/sync";

const FIXTURE_CONTENT = `---
name: Fixture
description: Fixture choreography for tests
coznt:
  version: 1.0.0
  required_verbs:
    - get_my_context
  min_autonomy: 0
---

# Fixture

Test body.
`;

const FIXTURE_HASH = sha256(FIXTURE_CONTENT);
const STANDARD_CONTENT = "# Coding Standards\n\nUse strict TypeScript.";
const STANDARD_HASH = sha256(STANDARD_CONTENT);

let tmpRoot = "";
let originalCwd = "";

function stubFetch(manifest: unknown, bundle: unknown): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/choreographies/sync")) {
      return new Response(JSON.stringify(bundle), { status: 200 });
    }
    if (url.includes("/choreographies")) {
      return new Response(JSON.stringify(manifest), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "coznt-sync-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpRoot);

  writeConfig({
    serverUrl: "http://test",
    projectId: "p1",
    apiKeyRef: { kind: "env", name: "COZNT_API_KEY_TEST" },
  });
  process.env.COZNT_API_KEY_TEST = "dummy-test-key";
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.COZNT_API_KEY_TEST;
  vi.restoreAllMocks();
});

describe("coznt sync", () => {
  it("fresh sync writes SKILL.md + .lock for every new entry", async () => {
    const manifest = {
      choreographies: [
        {
          slug: "fixture",
          version: "1.0.0",
          hash: FIXTURE_HASH,
          description: "Fixture choreography for tests",
          minAutonomy: 0,
        },
      ],
      manifestHash: "deadbeef",
    };
    const bundle = {
      choreographies: [
        { ...manifest.choreographies[0], content: FIXTURE_CONTENT },
      ],
      manifestHash: "deadbeef",
    };
    global.fetch = stubFetch(manifest, bundle) as unknown as typeof fetch;

    const code = await runSync({});
    expect(code).toBe(0);

    const skillPath = join(tmpRoot, ".coznt/skills/fixture/SKILL.md");
    const lockPath = join(tmpRoot, ".coznt/skills/fixture/.lock");
    expect(existsSync(skillPath)).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
    expect(readFileSync(skillPath, "utf-8")).toBe(FIXTURE_CONTENT);
    const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
    expect(lock.hash).toBe(FIXTURE_HASH);
    expect(lock.version).toBe("1.0.0");
  });

  it("fresh sync writes standards markdown + lock files", async () => {
    const manifest = { choreographies: [], manifestHash: "deadbeef" };
    const standardsManifest = {
      standards: [
        {
          slug: "coding_instructions",
          version: "1.0.0",
          hash: STANDARD_HASH,
          title: "Coding Standards",
          kind: "coding_standards",
          scope: "org",
          format: "markdown",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      missingRequired: [],
      requiredComplete: true,
      manifestHash: "standards-hash",
    };
    const standardsBundle = {
      ...standardsManifest,
      standards: [
        {
          ...standardsManifest.standards[0],
          content: STANDARD_CONTENT,
        },
      ],
    };
    global.fetch = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/standards/sync")) {
        return new Response(JSON.stringify(standardsBundle), { status: 200 });
      }
      if (url.includes("/standards")) {
        return new Response(JSON.stringify(standardsManifest), { status: 200 });
      }
      if (url.includes("/choreographies")) {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const code = await runSync({});
    expect(code).toBe(0);

    const standardPath = join(tmpRoot, ".coznt/artifacts/coding_instructions.md");
    const lockPath = join(tmpRoot, ".coznt/artifacts/coding_instructions.lock");
    expect(existsSync(standardPath)).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
    expect(readFileSync(standardPath, "utf-8")).toBe(STANDARD_CONTENT);
    const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
    expect(lock.hash).toBe(STANDARD_HASH);
    expect(lock.kind).toBe("coding_standards");
  });

  it("no-op when local lock matches remote hash", async () => {
    const manifest = {
      choreographies: [
        {
          slug: "fixture",
          version: "1.0.0",
          hash: FIXTURE_HASH,
          description: "Fixture choreography for tests",
          minAutonomy: 0,
        },
      ],
      manifestHash: "deadbeef",
    };
    const bundle = { choreographies: [], manifestHash: "deadbeef" };
    global.fetch = stubFetch(manifest, bundle) as unknown as typeof fetch;

    // Pre-seed: write the file + matching lock
    const skillDir = join(tmpRoot, ".coznt/skills/fixture");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), FIXTURE_CONTENT);
    writeFileSync(
      join(skillDir, ".lock"),
      JSON.stringify({ hash: FIXTURE_HASH, version: "1.0.0", syncedAt: new Date().toISOString() }),
    );

    const code = await runSync({});
    expect(code).toBe(0);
    // Bundle endpoint should not have been called (no fetch entries)
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("/sync"))).toBe(false);
  });

  it("warns when the running CLI is older than the server's published CLI", async () => {
    // Stub fetch to advertise a newer CLI via the /install/coznt-cli/latest
    // redirect. The CLI's package.json declares 0.1.0, so any other version
    // triggers the drift warning.
    const manifest = { choreographies: [], manifestHash: "x" };
    const baseStub = stubFetch(manifest, { choreographies: [], manifestHash: "x" });
    global.fetch = vi.fn(async (input: unknown, init?: unknown) => {
      const url = String(input);
      if (url.includes("/install/coznt-cli/latest")) {
        return new Response(null, {
          status: 302,
          headers: { location: `${"http://test"}/install/coznt-cli-9.9.9.tgz` },
        });
      }
      const fn = baseStub as unknown as (i: unknown, init?: unknown) => Promise<Response>;
      return fn(input, init);
    }) as unknown as typeof fetch;

    const warns: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((...args) => {
      warns.push(args.map(String).join(" "));
    });

    const code = await runSync({});
    expect(code).toBe(0);

    const all = warns.join("\n");
    expect(all).toContain("coznt CLI is stale");
    expect(all).toContain("9.9.9");
    expect(all).toMatch(/pnpm install -g .*coznt-cli-9\.9\.9\.tgz/);

    spy.mockRestore();
  });

  it("writes posture files (AGENTS.md + editor-native) when an editor is detected", async () => {
    // Posture writer keys off `detectEditors` — present `.claude/`
    // to trigger claude-code detection, which also writes CLAUDE.md.
    mkdirSync(join(tmpRoot, ".claude"), { recursive: true });

    const manifest = {
      choreographies: [
        {
          slug: "fixture",
          version: "1.0.0",
          hash: FIXTURE_HASH,
          description: "Fixture choreography for tests",
          minAutonomy: 0,
        },
      ],
      manifestHash: "abc123",
    };
    const bundle = {
      choreographies: [
        {
          slug: "fixture",
          version: "1.0.0",
          hash: FIXTURE_HASH,
          description: "Fixture choreography for tests",
          minAutonomy: 0,
          content: FIXTURE_CONTENT,
        },
      ],
      manifestHash: "abc123",
    };
    global.fetch = stubFetch(manifest, bundle) as unknown as typeof fetch;

    const code = await runSync({});
    expect(code).toBe(0);

    // Posture files should now exist with the managed-block markers.
    const agents = readFileSync(join(tmpRoot, "AGENTS.md"), "utf-8");
    const claude = readFileSync(join(tmpRoot, "CLAUDE.md"), "utf-8");
    expect(agents).toContain("Coznt governance");
    expect(claude).toContain("Coznt governance");
    expect(agents).toContain("<!-- coznt:posture:start -->");
  });

  it("--dry-run writes no files", async () => {
    const manifest = {
      choreographies: [
        {
          slug: "fixture",
          version: "1.0.0",
          hash: FIXTURE_HASH,
          description: "Fixture choreography for tests",
          minAutonomy: 0,
        },
      ],
      manifestHash: "deadbeef",
    };
    const bundle = { choreographies: [], manifestHash: "deadbeef" };
    global.fetch = stubFetch(manifest, bundle) as unknown as typeof fetch;

    const code = await runSync({ dryRun: true });
    expect(code).toBe(0);
    expect(existsSync(join(tmpRoot, ".coznt/skills/fixture/SKILL.md"))).toBe(false);
    expect(existsSync(join(tmpRoot, ".coznt/skills/fixture/.lock"))).toBe(false);
  });

  it("aborts with non-zero exit on hash mismatch", async () => {
    const manifest = {
      choreographies: [
        {
          slug: "fixture",
          version: "1.0.0",
          hash: FIXTURE_HASH,
          description: "Fixture choreography for tests",
          minAutonomy: 0,
        },
      ],
      manifestHash: "deadbeef",
    };
    // Tampered bundle: content doesn't match the manifest hash
    const bundle = {
      choreographies: [
        { ...manifest.choreographies[0], content: "TAMPERED CONTENT" },
      ],
      manifestHash: "deadbeef",
    };
    global.fetch = stubFetch(manifest, bundle) as unknown as typeof fetch;

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await runSync({});
    expect(code).toBe(1);
    expect(existsSync(join(tmpRoot, ".coznt/skills/fixture/SKILL.md"))).toBe(false);
    errSpy.mockRestore();
  });
});
