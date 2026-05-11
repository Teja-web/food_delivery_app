"use server";

import { projectCrud } from "@/operations/projects";

export async function listProjects(opts: { offset?: number; limit?: number } = {}) {
  return projectCrud.list({ offset: opts.offset ?? 0, limit: opts.limit ?? 25, sortBy: "createdAt", sortOrder: "desc" });
}

export async function searchProjects(query: string, opts: { offset?: number; limit?: number } = {}) {
  return projectCrud.search(query, { offset: opts.offset ?? 0, limit: opts.limit ?? 25 });
}

export async function getProject(id: string) {
  return projectCrud.get(id);
}

export async function createProject(input: Parameters<typeof projectCrud.create>[0]) {
  return projectCrud.create(input);
}

export async function updateProject(id: string, input: Parameters<typeof projectCrud.update>[1]) {
  return projectCrud.update(id, input);
}

export async function deleteProject(id: string) {
  return projectCrud.delete(id);
}
