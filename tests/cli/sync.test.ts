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
