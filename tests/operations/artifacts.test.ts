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
    status: "pending" | "approved" | "rejected";
    metadata: Record<string, unknown>;
    creatorId: string | null;
    creatorName: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
  updatedProjectRows: [] as Array<{
    id: string;
    organizationId: string;
    projectId: string;
    name: string;
    body: string;
    summary: string | null;
    type: ".md" | ".txt";
    category: string | null;
    createdVia: "MCP" | "upload";
    status: "pending" | "approved" | "rejected";
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
        findFirst: vi.fn(() => Promise.resolve(undefined)),
      },
      projects: {
        findFirst: vi.fn(() => Promise.resolve({ id: "proj_test" })),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(mockArtifacts.updatedProjectRows)),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
  },
}));

import {
  getProjectArtifactsReadiness,
  getOrganizationArtifactsReadiness,
  getProjectArtifactsManifest,
  hashArtifactBody,
  REQUIRED_ORGANIZATION_ARTIFACT_FILE_NAMES,
  upsertProjectArtifact,
} from "@/operations/artifacts";
import { buildScopedContext, runWithMessageContext } from "@/lib/auth/context";

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
    status: "approved" as const,
    metadata: {
      title: input.name.replace(/\.md$/, ""),
      sourceOrganizationArtifactId: input.sourceOrganizationArtifactId,
      contentHash: hashArtifactBody(`# ${input.name}`),
    },
  };
}

function projectExclusiveArtifact(input: {
  id: string;
  name: string;
  title: string;
  projectArtifactKind?: "requirements" | "design" | "custom";
}) {
  return {
    ...orgArtifact({ id: input.id, name: input.name }),
    projectId: PROJECT,
    category: "project-exclusive",
    createdVia: "MCP" as const,
    status: "approved" as const,
    metadata: {
      title: input.title,
      contentHash: hashArtifactBody(`# ${input.name}`),
      ...(input.projectArtifactKind
        ? { projectArtifactKind: input.projectArtifactKind }
        : {}),
    },
  };
}

describe("artifact operations", () => {
  beforeEach(() => {
    mockArtifacts.organizationRows = [];
    mockArtifacts.projectRows = [];
    mockArtifacts.updatedProjectRows = [];
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

  it("requires both project Requirements and Design artifacts", async () => {
    mockArtifacts.projectRows = [
      projectExclusiveArtifact({
        id: "art_project_requirements",
        name: "requirements.md",
        title: "Project Requirements",
      }),
    ];

    const readiness = await getProjectArtifactsReadiness(ORG, PROJECT);

    expect(readiness.requiredComplete).toBe(false);
    expect(readiness.presentRequired).toEqual(["requirements"]);
    expect(readiness.missingRequired).toEqual(["design"]);
  });

  it("recognizes explicit MCP project artifact kind metadata", async () => {
    mockArtifacts.projectRows = [
      projectExclusiveArtifact({
        id: "art_project_requirements",
        name: "prd.md",
        title: "PRD",
        projectArtifactKind: "requirements",
      }),
      projectExclusiveArtifact({
        id: "art_project_design",
        name: "architecture-notes.md",
        title: "Architecture Notes",
        projectArtifactKind: "design",
      }),
    ];

    const readiness = await getProjectArtifactsReadiness(ORG, PROJECT);

    expect(readiness.requiredComplete).toBe(true);
    expect(readiness.presentRequired).toEqual(["requirements", "design"]);
    expect(readiness.missingRequired).toEqual([]);
  });

  it("treats reserved requirements filename as required even if an old MCP row marked it custom", async () => {
    mockArtifacts.projectRows = [
      {
        ...projectExclusiveArtifact({
          id: "art_project_requirements",
          name: "requirements.md",
          title: "Requirements",
          projectArtifactKind: "custom",
        }),
        category: "project-standard",
      },
    ];

    const readiness = await getProjectArtifactsReadiness(ORG, PROJECT);
    const manifest = await getProjectArtifactsManifest(ORG, PROJECT);

    expect(readiness.requiredComplete).toBe(false);
    expect(readiness.presentRequired).toEqual(["requirements"]);
    expect(readiness.missingRequired).toEqual(["design"]);
    expect(manifest.artifacts[0]?.projectArtifactKind).toBe("requirements");
    expect(manifest.artifacts[0]?.kind).toBe("requirements");
  });

  it("upserts Requirements by project artifact kind instead of creating duplicate filenames", async () => {
    const existing = projectExclusiveArtifact({
      id: "art_project_requirements",
      name: "requirements-v1.md",
      title: "Project Requirements",
      projectArtifactKind: "requirements",
    });
    const updated = {
      ...existing,
      name: "requirements.md",
      body: "# Updated requirements",
      metadata: {
        title: "Project Requirements",
        projectArtifactKind: "requirements",
        contentHash: hashArtifactBody("# Updated requirements"),
      },
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    };
    mockArtifacts.projectRows = [existing];
    mockArtifacts.updatedProjectRows = [updated];

    const ctx = buildScopedContext(
      ORG,
      { id: "api:key", name: "API client", email: "api@coznt" },
      { role: "member", projectId: PROJECT },
    );
    const row = await runWithMessageContext(ctx, () =>
      upsertProjectArtifact({
        projectId: PROJECT,
        title: "Project Requirements",
        name: "requirements.md",
        body: "# Updated requirements",
        type: ".md",
        category: "project-exclusive",
        projectArtifactKind: "requirements",
        createdVia: "MCP",
      }),
    );

    expect(row.id).toBe(existing.id);
    expect(row.name).toBe("requirements.md");
  });
});
