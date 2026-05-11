"use server";

import { adapterBindingCrud, listBindingsForProject } from "@/operations/adapter-bindings";

export async function listAdapterBindings(opts: { offset?: number; limit?: number } = {}) {
  return adapterBindingCrud.list({
    offset: opts.offset ?? 0,
    limit: opts.limit ?? 50,
    sortBy: "createdAt",
    sortOrder: "desc",
  });
}

export async function getAdapterBinding(id: string) {
  return adapterBindingCrud.get(id);
}

export async function createAdapterBinding(input: Parameters<typeof adapterBindingCrud.create>[0]) {
  return adapterBindingCrud.create(input);
}

export async function updateAdapterBinding(
  id: string,
  input: Parameters<typeof adapterBindingCrud.update>[1],
) {
  return adapterBindingCrud.update(id, input);
}

export async function deleteAdapterBinding(id: string) {
  return adapterBindingCrud.delete(id);
}

export { listBindingsForProject };
