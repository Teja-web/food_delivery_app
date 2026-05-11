"use server";

import {
  getTriageItems as _getTriageItems,
  getTriageItem as _getTriageItem,
  createTriageItem as _createTriageItem,
  updateTriageItem as _updateTriageItem,
  deleteTriageItem as _deleteTriageItem,
  getTriageItemsForRole as _getTriageItemsForRole,
  getTriageItemsForEntity as _getTriageItemsForEntity,
  getRoleFulfilmentsByIds as _getRoleFulfilmentsByIds,
} from "../operations/triage-items";

export async function listTriageItems(opts?: { offset?: number; limit?: number; sortBy?: string; sortOrder?: "asc" | "desc" }) {
  return _getTriageItems(opts);
}

async function fetchTriageItem(id: string) {
  return _getTriageItem(id);
}

async function addTriageItem(data: Record<string, unknown>) {
  return _createTriageItem(data);
}

async function editTriageItem(id: string, data: Record<string, unknown>) {
  return _updateTriageItem(id, data);
}

async function removeTriageItem(id: string) {
  return _deleteTriageItem(id);
}

export async function fetchTriageItemsForRole(roleId: string) {
  return _getTriageItemsForRole(roleId);
}

export async function fetchTriageItemsForEntity(entityType: "role" | "candidate" | "interview" | "application", entityId: string) {
  return _getTriageItemsForEntity(entityType, entityId);
}

export async function fetchRoleFulfilments(roleIds: string[]) {
  const map = await _getRoleFulfilmentsByIds(roleIds);
  return Object.fromEntries(map);
}
