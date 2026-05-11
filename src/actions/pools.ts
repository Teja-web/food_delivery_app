"use server";

import {
  getPools as _getPools,
  getPool as _getPool,
  createPool as _createPool,
  updatePool as _updatePool,
  deletePool as _deletePool,
  getPoolNewMemberCounts as _getPoolNewMemberCounts,
  getPoolDetail as _getPoolDetail,
} from "../operations/pools";

export async function listPools(opts?: { offset?: number; limit?: number; sortBy?: string; sortOrder?: "asc" | "desc" }) {
  return _getPools(opts);
}

export async function fetchPool(id: string) {
  return _getPool(id);
}

export async function fetchPoolDetail(id: string) {
  return _getPoolDetail(id);
}

export async function addPool(data: Record<string, unknown>) {
  return _createPool(data);
}

export async function editPool(id: string, data: Record<string, unknown>) {
  return _updatePool(id, data);
}

export async function removePool(id: string) {
  return _deletePool(id);
}

export async function getPoolNewMemberCounts(organizationId?: string) {
  if (!organizationId) {
    const { getActionContext } = await import("@/lib/auth/context");
    const ctx = await getActionContext();
    return _getPoolNewMemberCounts(ctx.organizationId);
  }
  return _getPoolNewMemberCounts(organizationId);
}
