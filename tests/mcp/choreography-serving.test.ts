/**
 * Choreography distribution — hash stability, manifest determinism,
 * project-scoping, `slugs?` filter.
 *
 * Uses the real filesystem + a stubbed DB (vi.mock on @/db/client) so
 * the test exercises the operations layer without needing a Postgres
 * connection.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";

// Mock the DB before importing the operation module. The mock returns
// a chainable builder whose final `.where(...)` resolves to a fixture row set.
const mockSkillRows = vi.hoisted(() => ({
  rows: [
    { slug: "release-notes-generator", enabled: true, projectId: null as string | null },
  ],
}));

vi.mock("@/db/client", () => {
  const builder = {
    from: () => builder,
    where: () => Promise.resolve(mockSkillRows.rows),
  };
  return {
    db: {
      select: () => builder,
    },
  };
});

import {
  listChoreographies,
  getChoreographyBundle,
} from "@/operations/choreographies";

const ORG = "org_test";
const PROJECT = "proj_test";

describe("Choreography distribution", () => {
  beforeEach(() => {
    mockSkillRows.rows = [
      { slug: "release-notes-generator", enabled: true, projectId: null },
    ];
  });

  it("returns a manifest entry for each enabled, file-present skill", async () => {
    const manifest = await listChoreographies(ORG, PROJECT);
    expect(manifest.choreographies).toHaveLength(1);
    expect(manifest.choreographies[0].slug).toBe("release-notes-generator");
    expect(manifest.choreographies[0].hash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("manifest hash is stable across calls (deterministic)", async () => {
    const a = await listChoreographies(ORG, PROJECT);
    const b = await listChoreographies(ORG, PROJECT);
    expect(a.manifestHash).toBe(b.manifestHash);
    expect(a.choreographies[0].hash).toBe(b.choreographies[0].hash);
  });

  it("includes frontmatter description and min_autonomy", async () => {
    const manifest = await listChoreographies(ORG, PROJECT);
    expect(manifest.choreographies[0].description).toContain("release notes");
    expect(manifest.choreographies[0].minAutonomy).toBe("propose");
  });

  it("skips DB skills that have no CHOREOGRAPHY.md on disk", async () => {
    mockSkillRows.rows = [
      { slug: "release-notes-generator", enabled: true, projectId: null },
      { slug: "nonexistent-skill", enabled: true, projectId: null },
    ];
    const manifest = await listChoreographies(ORG, PROJECT);
    expect(manifest.choreographies).toHaveLength(1);
    expect(manifest.choreographies[0].slug).toBe("release-notes-generator");
  });

  it("sync returns full content bundle by default", async () => {
    const bundle = await getChoreographyBundle(ORG, PROJECT);
    expect(bundle.choreographies).toHaveLength(1);
    expect(bundle.choreographies[0].content).toContain("---");
    expect(bundle.choreographies[0].content).toContain("required_verbs");
    expect(bundle.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("sync with slugs filter returns only requested entries", async () => {
    const bundle = await getChoreographyBundle(ORG, PROJECT, ["release-notes-generator"]);
    expect(bundle.choreographies).toHaveLength(1);
    expect(bundle.choreographies[0].slug).toBe("release-notes-generator");
  });

  it("sync with unknown slug throws", async () => {
    await expect(
      getChoreographyBundle(ORG, PROJECT, ["does-not-exist"]),
    ).rejects.toThrow(/Unknown choreography slug/);
  });

  it("manifest hash matches when manifests are equal", async () => {
    // The manifestHash is a function of {slug, hash} pairs. Two calls
    // over the same fixture must agree byte-for-byte.
    const a = await listChoreographies(ORG, PROJECT);
    const b = await listChoreographies(ORG, PROJECT);
    expect(a.manifestHash).toBe(b.manifestHash);
  });
});
