import { z } from "zod/v4";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { projects, PROJECT_PHASES, PROJECT_STATUSES, type ProjectPhase } from "@/db/schema/project";
import { phaseGates, type GateType, type NewPhaseGate } from "@/db/schema/phase-gate";
import { safeRevalidate } from "@/lib/safe-revalidate";

const projectSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "lowercase letters, digits and hyphens only"),
  description: z.string().optional(),
  phase: z.enum(PROJECT_PHASES).default("requirements"),
  status: z.enum(PROJECT_STATUSES).default("active"),
  repoUrl: z.string().url().optional().or(z.literal("")),
  jiraProjectKey: z.string().optional(),
  adoProjectId: z.string().optional(),
  confluenceSpaceKey: z.string().optional(),
  requireHumanApprovalForMerge: z.boolean().optional(),
});

/**
 * Default phase gates seeded into every new project so `tryAdvancePhase`
 * has something to evaluate from day one. Without this, every project
 * gets stuck at requirements (the advance helper refuses to flip phase
 * when the current phase has zero gates — see `phase-advance.ts`).
 *
 * Teams customize these later via the per-project gates UI; this is the
 * "works out of the box" baseline. Monitoring is the terminal phase, so
 * no gates are required there.
 */
const DEFAULT_GATES: Record<
  ProjectPhase,
  Array<{ name: string; description: string; type: GateType; threshold?: number }>
> = {
  requirements: [
    {
      name: "Requirements approved",
      description: "Product owner / stakeholder sign-off on the requirements set.",
      type: "approval",
    },
  ],
  design: [
    {
      name: "Design approved",
      description: "Architecture / UX review sign-off on the design artifacts.",
      type: "approval",
    },
  ],
  development: [
    {
      name: "Implementation complete",
      description: "Engineering lead confirms in-scope work items are merged.",
      type: "approval",
    },
  ],
  testing: [
    {
      name: "Tests passing",
      description: "QA sign-off that the agreed test plan executed without regressions.",
      type: "approval",
    },
    {
      name: "Coverage ≥ 80%",
      description: "Most recent TEST_COVERAGE metric meets the 80% bar.",
      type: "coverage",
      threshold: 80,
    },
  ],
  cicd: [
    {
      name: "CI build green",
      description: "Most recent CI lint run on the release branch succeeded.",
      type: "lint",
    },
    {
      name: "Security scan passed",
      description: "Most recent security scan reported no blocking findings.",
      type: "security",
    },
  ],
  monitoring: [],
};

async function seedDefaultPhaseGates(record: { id: string; organizationId: string }) {
  const rows: NewPhaseGate[] = [];
  for (const phase of PROJECT_PHASES) {
    for (const gate of DEFAULT_GATES[phase]) {
      rows.push({
        organizationId: record.organizationId,
        projectId: record.id,
        phase,
        name: gate.name,
        description: gate.description,
        type: gate.type,
        threshold: gate.threshold,
      });
    }
  }
  if (rows.length === 0) return;
  // onConflictDoNothing keeps create idempotent against the
  // (projectId, phase, name) unique index — re-running the seeder
  // (or a future retry path) won't fail.
  await db.insert(phaseGates).values(rows).onConflictDoNothing();
}

export const projectCrud = createEntityCrud({
  db,
  table: projects,
  queryKey: "projects",
  idField: "id",
  schema: projectSchema,
  searchFields: ["name", "description"],
  onMutate: () => safeRevalidate("/projects"),
  hooks: {
    afterCreate: async (record) => {
      await seedDefaultPhaseGates(record);
    },
  },
});
