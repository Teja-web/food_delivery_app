import { z } from "zod/v4";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { skills } from "@/db/schema/skill/skill";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const skillSchema = z.object({
  projectId: z.string().optional().nullable(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
  body: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().default(true),
});

export const skillCrud = createEntityCrud({
  db,
  table: skills,
  queryKey: "skills",
  idField: "id",
  schema: skillSchema,
  searchFields: ["name", "description", "body"],
  onMutate: () => safeRevalidate("/skills"),
});

/** Skills available to a project: project-scoped + org-wide. */
export async function listSkillsForProject(projectId: string) {
  const ctx = await getActionContext();
  return db.query.skills.findMany({
    where: and(
      eq(skills.organizationId, ctx.organizationId),
      eq(skills.enabled, true),
      or(eq(skills.projectId, projectId), isNull(skills.projectId)),
    ),
  });
}
