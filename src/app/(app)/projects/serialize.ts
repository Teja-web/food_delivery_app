import type { Project } from "@/db/schema/project";

export interface ProjectListItemDTO {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phase: Project["phase"];
  status: Project["status"];
  updatedAt: string;
}

export function serializeProject(p: Project): ProjectListItemDTO {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    phase: p.phase,
    status: p.status,
    updatedAt: p.updatedAt.toISOString(),
  };
}
