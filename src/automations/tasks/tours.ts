/**
 * Tour seeding tasks — triggered by rules engine on first entity creation.
 * Seeds a workflow tour for the user if they haven't seen it yet.
 */

import { db } from "@/db/client";
import { tourProgress, roles, candidates, interviews, offers, assessments } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { nanoid } from "nanoid";

interface TourTaskParams {
  organizationId: string;
  entityId: string;
  userId?: string;
  data?: Record<string, unknown>;
}

async function seedTourIfFirst(params: {
  userId: string;
  organizationId: string;
  tourId: string;
  entityTable: any;
  entityOrgField: any;
}) {
  const { userId, organizationId, tourId, entityTable, entityOrgField } = params;

  // Check if tour already exists for this user
  const existing = await db
    .select()
    .from(tourProgress)
    .where(
      and(
        eq(tourProgress.userId, userId),
        eq(tourProgress.organizationId, organizationId),
        eq(tourProgress.tourId, tourId),
      ),
    )
    .limit(1);

  if (existing.length > 0) return;

  // Check if this is the first entity of this type (count === 1 means just created)
  const [result] = await db
    .select({ total: count() })
    .from(entityTable)
    .where(eq(entityOrgField, organizationId));

  if (result.total > 1) return;

  // Seed the tour
  await db.insert(tourProgress).values({
    id: nanoid(),
    userId,
    organizationId,
    tourId,
    status: "pending",
    currentStep: null,
  });
}

export async function tourSeedFirstRole(params: TourTaskParams) {
  if (!params.userId) return;
  await seedTourIfFirst({
    userId: params.userId,
    organizationId: params.organizationId,
    tourId: "first-role-created",
    entityTable: roles,
    entityOrgField: roles.organizationId,
  });
}

export async function tourSeedFirstCandidate(params: TourTaskParams) {
  if (!params.userId) return;
  await seedTourIfFirst({
    userId: params.userId,
    organizationId: params.organizationId,
    tourId: "first-candidate-added",
    entityTable: candidates,
    entityOrgField: candidates.organizationId,
  });
}

export async function tourSeedFirstInterview(params: TourTaskParams) {
  if (!params.userId) return;
  await seedTourIfFirst({
    userId: params.userId,
    organizationId: params.organizationId,
    tourId: "first-interview-scheduled",
    entityTable: interviews,
    entityOrgField: interviews.organizationId,
  });
}

export async function tourSeedFirstOffer(params: TourTaskParams) {
  if (!params.userId) return;
  await seedTourIfFirst({
    userId: params.userId,
    organizationId: params.organizationId,
    tourId: "first-offer-created",
    entityTable: offers,
    entityOrgField: offers.organizationId,
  });
}

export async function tourSeedFirstAssessment(params: TourTaskParams) {
  if (!params.userId) return;
  await seedTourIfFirst({
    userId: params.userId,
    organizationId: params.organizationId,
    tourId: "first-assessment-created",
    entityTable: assessments,
    entityOrgField: assessments.organizationId,
  });
}
