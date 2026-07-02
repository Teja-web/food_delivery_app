import { beforeEach, describe, expect, it, vi } from "vitest";

const mockArtifacts = vi.hoisted(() => ({
  organizationRows: [] as Array<{
    id: string;
    organizationId: string;
    name: string;
    body: string;
    summary: string | null;
    type: ".md" | ".txt";
    category: string | null;
    metadata: Record<string, unknown>;
    creatorId: string | null;
    creatorName: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
  projectRows: [] as Array<{
    id: string;
    organizationId: string;
    projectId: string;
    name: string;
    body: string;
    summary: string | null;
    type: ".md" | ".txt";
    category: string | null;
    createdVia: "MCP" | "upload";
    metadata: Record<string, unknown>;
    creatorId: string | null;
    creatorName: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
}));

vi.mock("@/db/client", () => ({
  db: {
    query: {
      organizationArtifacts: {
        findMany: vi.fn(() => Promise.resolve(mockArtifacts.organizationRows)),
      },
      projectArtifacts: {
        findMany: vi.fn(() => Promise.resolve(mockArtifacts.projectRows)),
      },
    },
  },
}));

import {
  getOrganizationArtifactsReadiness,
  getProjectArtifactsManifest,
  hashArtifactBody,
  REQUIRED_ORGANIZATION_ARTIFACT_FILE_NAMES,
} from "@/operations/artifacts";

const ORG = "org_test";
const PROJECT = "proj_test";

function orgArtifact(input: {
  id: string;
  requiredKey?: "coding_standards" | "brand_guidelines" | "architecture_principles";
  name: string;
}) {
  return {
    id: input.id,
    organizationId: ORG,
    name: input.name,
    body: `# ${input.name}`,
    summary: null,
    type: ".md" as const,
    category: null,
    metadata: {
      requiredKey: input.requiredKey,
      slug: input.name.replace(/\.md$/, ""),
      title: input.name.replace(/\.md$/, ""),
      contentHash: hashArtifactBody(`# ${input.name}`),
    },
    creatorId: null,
    creatorName: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function projectArtifact(input: { id: string; sourceOrganizationArtifactId: string; name: string }) {
  return {
    ...orgArtifact({ id: input.id, name: input.name }),
    projectId: PROJECT,
    createdVia: "upload" as const,
    metadata: {
      slug: input.name.replace(/\.md$/, ""),
      title: input.name.replace(/\.md$/, ""),
      sourceOrganizationArtifactId: input.sourceOrganizationArtifactId,
      contentHash: hashArtifactBody(`# ${input.name}`),
    },
  };
}

describe("artifact operations", () => {
  beforeEach(() => {
    mockArtifacts.organizationRows = [];
    mockArtifacts.projectRows = [];
  });

  it("reports missing required organization artifacts", async () => {
    mockArtifacts.organizationRows = [
      orgArtifact({
        id: "art_org_code",
        requiredKey: "coding_standards",
        name: REQUIRED_ORGANIZATION_ARTIFACT_FILE_NAMES.coding_standards,
      }),
    ];

    const readiness = await getOrganizationArtifactsReadiness(ORG);

    expect(readiness.requiredComplete).toBe(false);
    expect(readiness.presentRequired).toEqual(["coding_standards"]);
    expect(readiness.missingRequired).toEqual([
      "brand_guidelines",
      "architecture_principles",
    ]);
  });

  it("uses only cloned project artifact snapshots in the project manifest", async () => {
    mockArtifacts.organizationRows = [
      orgArtifact({
        id: "art_org_code",
        requiredKey: "coding_standards",
        name: REQUIRED_ORGANIZATION_ARTIFACT_FILE_NAMES.coding_standards,
      }),
      orgArtifact({
        id: "art_org_brand",
        requiredKey: "brand_guidelines",
        name: REQUIRED_ORGANIZATION_ARTIFACT_FILE_NAMES.brand_guidelines,
      }),
      orgArtifact({
        id: "art_org_arch",
        requiredKey: "architecture_principles",
        name: REQUIRED_ORGANIZATION_ARTIFACT_FILE_NAMES.architecture_principles,
      }),
    ];
    mockArtifacts.projectRows = [
      projectArtifact({
        id: "art_project_code",
        sourceOrganizationArtifactId: "art_org_code",
        name: REQUIRED_ORGANIZATION_ARTIFACT_FILE_NAMES.coding_standards,
      }),
    ];

    const manifest = await getProjectArtifactsManifest(ORG, PROJECT);

    expect(manifest.requiredComplete).toBe(true);
    expect(manifest.artifacts.map((artifact) => artifact.name)).toEqual([
      "coding_instructions.md",
    ]);
    expect(manifest.artifacts[0]?.scope).toBe("project");
  });
});
