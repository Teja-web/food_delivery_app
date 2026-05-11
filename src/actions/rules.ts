"use server";

import { ruleCrud, listRulesForProject } from "@/operations/rules";

export async function listRules(opts: { offset?: number; limit?: number } = {}) {
  return ruleCrud.list({ offset: opts.offset ?? 0, limit: opts.limit ?? 25, sortBy: "createdAt", sortOrder: "desc" });
}

export async function getRule(id: string) {
  return ruleCrud.get(id);
}

export async function createRule(input: Parameters<typeof ruleCrud.create>[0]) {
  return ruleCrud.create(input);
}

export async function updateRule(id: string, input: Parameters<typeof ruleCrud.update>[1]) {
  return ruleCrud.update(id, input);
}

export async function deleteRule(id: string) {
  return ruleCrud.delete(id);
}

export { listRulesForProject };
