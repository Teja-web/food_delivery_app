/**
 * Environment CRUD — explicit deploy targets per project.
 */

import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { environments, ENVIRONMENT_TIERS } from "@/db/schema/environment";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const envSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  tier: z.enum(ENVIRONMENT_TIERS).nullable().optional(),
  url: z.string().url().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const environmentCrud = createEntityCrud({
  db,
  table: environments,
  queryKey: "environments",
  idField: "id",
  schema: envSchema,
  searchFields: ["name"],
  onMutate: () => safeRevalidate("/settings/environments"),
});

export async function listEnvironmentsForProject(projectId: string) {
  const ctx = await getActionContext();
  return db.query.environments.findMany({
    where: and(
      eq(environments.organizationId, ctx.organizationId),
      eq(environments.projectId, projectId),
    ),
  });
}
