import { describe, expect, it, beforeEach, vi } from "vitest";

const mockStandards = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    organizationId: string;
    projectId: string | null;
    kind: "coding_standards" | "brand_guidelines" | "architecture_principles" | "custom";
    slug: string;
    title: string;
    body: string;
    format: "markdown" | "text";
    version: string;
    contentHash: string;
    sourceFileName: string | null;
    enabled: boolean;
    deletedAt: Date | null;
    createdById: string | null;
    createdByName: string | null;
    updatedById: string | null;
    updatedByName: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
}));

vi.mock("@/db/client", () => ({
  db: {
    query: {
      standards: {
        findMany: vi.fn(() => Promise.resolve(mockStandards.rows)),
      },
    },
  },
}));

import {
  getEffectiveStandards,
  getOrgStandardsReadiness,
  hashStandardBody,
} from "@/operations/standards";

const ORG = "org_test";
const PROJECT = "proj_test";

function row(input: {
  id: string;
  projectId: string | null;
  kind: "coding_standards" | "brand_guidelines" | "architecture_principles" | "custom";
  slug: string;
  title: string;
  updatedAt?: Date;
}) {
  return {
    id: input.id,
    organizationId: ORG,
    projectId: input.projectId,
    kind: input.kind,
    slug: input.slug,
    title: input.title,
    body: `# ${input.title}`,
    format: "markdown" as const,
    version: "1.0.0",
    contentHash: hashStandardBody(`# ${input.title}`),
    sourceFileName: null,
    enabled: true,
    deletedAt: null,
    createdById: null,
    createdByName: null,
    updatedById: null,
    updatedByName: null,
    createdAt: input.updatedAt ?? new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: input.updatedAt ?? new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("standards operations", () => {
  beforeEach(() => {
    mockStandards.rows = [];
  });

  it("reports missing required org standards", async () => {
    mockStandards.rows = [
      row({ id: "std_1", projectId: null, kind: "coding_standards", slug: "coding-standards", title: "Coding Standards" }),
    ];

    const readiness = await getOrgStandardsReadiness(ORG);

    expect(readiness.requiredComplete).toBe(false);
    expect(readiness.presentRequired).toEqual(["coding_standards"]);
    expect(readiness.missingRequired).toEqual([
      "brand_guidelines",
      "architecture_principles",
    ]);
  });

  it("resolves project overrides ahead of org standards", async () => {
    mockStandards.rows = [
      row({ id: "std_org_code", projectId: null, kind: "coding_standards", slug: "coding-standards", title: "Org Coding" }),
      row({ id: "std_project_code", projectId: PROJECT, kind: "coding_standards", slug: "coding-standards", title: "Project Coding" }),
      row({ id: "std_brand", projectId: null, kind: "brand_guidelines", slug: "brand-guidelines", title: "Org Brand" }),
      row({ id: "std_arch", projectId: null, kind: "architecture_principles", slug: "architecture-principles", title: "Org Architecture" }),
      row({ id: "std_custom_org", projectId: null, kind: "custom", slug: "qa", title: "Org QA" }),
      row({ id: "std_custom_project", projectId: PROJECT, kind: "custom", slug: "qa", title: "Project QA" }),
    ];

    const effective = await getEffectiveStandards(ORG, PROJECT);

    expect(effective.map((standard) => standard.title)).toEqual([
      "Project Coding",
      "Org Brand",
      "Org Architecture",
      "Project QA",
    ]);
  });
});
