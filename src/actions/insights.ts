"use server";

import {
  getHiringVelocity as _getHiringVelocity,
  getPipelineHealth as _getPipelineHealth,
  getSourceEffectiveness as _getSourceEffectiveness,
  getRecentHires as _getRecentHires,
  getBottlenecks as _getBottlenecks,
  getOpenRolesOverview as _getOpenRolesOverview,
  getOfferAcceptance as _getOfferAcceptance,
  getInterviewOutcomes as _getInterviewOutcomes,
  getMyActivityToday as _getMyActivityToday,
  getTeamActivity as _getTeamActivity,
} from "@/operations/insights";
import { getActionContext } from "@/lib/auth/context";

export async function fetchHiringVelocity() {
  const ctx = await getActionContext();
  return _getHiringVelocity(ctx.organizationId);
}

export async function fetchPipelineHealth() {
  const ctx = await getActionContext();
  return _getPipelineHealth(ctx.organizationId);
}

export async function fetchSourceEffectiveness() {
  const ctx = await getActionContext();
  return _getSourceEffectiveness(ctx.organizationId);
}

export async function fetchRecentHires(limit?: number) {
  const ctx = await getActionContext();
  return _getRecentHires(ctx.organizationId, limit);
}

export async function fetchBottlenecks() {
  const ctx = await getActionContext();
  return _getBottlenecks(ctx.organizationId);
}

export async function fetchOpenRolesOverview() {
  const ctx = await getActionContext();
  return _getOpenRolesOverview(ctx.organizationId);
}

export async function fetchOfferAcceptance() {
  const ctx = await getActionContext();
  return _getOfferAcceptance(ctx.organizationId);
}

export async function fetchInterviewOutcomes() {
  const ctx = await getActionContext();
  return _getInterviewOutcomes(ctx.organizationId);
}

export async function fetchMyActivityToday() {
  const ctx = await getActionContext();
  if (!ctx.userId) return { candidatesScreened: 0, interviewsScheduled: 0, applicationsAdvanced: 0, offersMade: 0 };
  return _getMyActivityToday(ctx.organizationId, ctx.userId);
}

export async function fetchTeamActivity() {
  const ctx = await getActionContext();
  return _getTeamActivity(ctx.organizationId);
}
