import { z } from "zod/v4";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { projects, PROJECT_PHASES, PROJECT_STATUSES } from "@/db/schema/project";
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
});

export const projectCrud = createEntityCrud({
  db,
  table: projects,
  queryKey: "projects",
  idField: "id",
  schema: projectSchema,
  searchFields: ["name", "description"],
  onMutate: () => safeRevalidate("/projects"),
});
