"use server";

import {
  getDepartments as _getDepartments,
  getDepartment as _getDepartment,
  createDepartment as _createDepartment,
  updateDepartment as _updateDepartment,
  deleteDepartment as _deleteDepartment,
} from "../operations/organization";

export async function listDepartments(opts?: { offset?: number; limit?: number; sortBy?: string; sortOrder?: "asc" | "desc" }) {
  return _getDepartments(opts);
}

async function fetchDepartment(id: string) {
  return _getDepartment(id);
}

export async function addDepartment(data: Record<string, unknown>) {
  return _createDepartment(data);
}

export async function editDepartment(id: string, data: Record<string, unknown>) {
  return _updateDepartment(id, data);
}

export async function removeDepartment(id: string) {
  return _deleteDepartment(id);
}
