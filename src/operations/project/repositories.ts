/**
 * Repository CRUD — multi-repo per project.
 *
 * Replaces the per-project `repoUrl/jiraProjectKey/adoProjectId/confluenceSpaceKey`
 * columns and the legacy `repo_policies` table's project-link slot. Per-remote
 * trust policy (if reintroduced) would live in `branchPolicy` JSONB.
 */

import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import {
  repositories,
  REPOSITORY_SOURCES,
} from "@/db/schema/repository";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const repoSchema = z.object({
  projectId: z.string().min(1),
  source: z.enum(REPOSITORY_SOURCES),
  identifier: z.string().min(1),
  url: z.string().url().nullable().optional(),
  defaultBranch: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  branchPolicy: z.record(z.string(), z.unknown()).optional(),
});

export const repositoryCrud = createEntityCrud({
  db,
  table: repositories,
  queryKey: "repositories",
  idField: "id",
  schema: repoSchema,
  searchFields: ["identifier", "url"],
  onMutate: () => safeRevalidate("/settings/repositories"),
});

export async function listRepositoriesForProject(projectId: string) {
  const ctx = await getActionContext();
  return db.query.repositories.findMany({
    where: and(
      eq(repositories.organizationId, ctx.organizationId),
      eq(repositories.projectId, projectId),
    ),
  });
}
