"use server";

import { db } from "@/db/client";
import { tourProgress } from "@/db/schema";
import { getActionContext } from "@/lib/auth/context";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function getPendingToursAction() {
  const ctx = await getActionContext();
  const rows = await db
    .select()
    .from(tourProgress)
    .where(
      and(
        eq(tourProgress.userId, ctx.user.id),
        eq(tourProgress.organizationId, ctx.organizationId),
        eq(tourProgress.status, "pending"),
      ),
    );
  return rows;
}

export async function updateTourProgressAction(
  tourId: string,
  status: "pending" | "completed" | "skipped",
  currentStep?: number,
) {
  const ctx = await getActionContext();

  const existing = await db
    .select()
    .from(tourProgress)
    .where(
      and(
        eq(tourProgress.userId, ctx.user.id),
        eq(tourProgress.organizationId, ctx.organizationId),
        eq(tourProgress.tourId, tourId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(tourProgress)
      .set({
        status,
        currentStep: currentStep ?? existing[0].currentStep,
        completedAt: status === "completed" || status === "skipped" ? new Date() : null,
      })
      .where(eq(tourProgress.id, existing[0].id));
  } else {
    await db.insert(tourProgress).values({
      id: nanoid(),
      userId: ctx.user.id,
      organizationId: ctx.organizationId,
      tourId,
      status,
      currentStep: currentStep ?? null,
    });
  }
}

export async function seedTourForUserAction(tourId: string) {
  const ctx = await getActionContext();

  const existing = await db
    .select()
    .from(tourProgress)
    .where(
      and(
        eq(tourProgress.userId, ctx.user.id),
        eq(tourProgress.organizationId, ctx.organizationId),
        eq(tourProgress.tourId, tourId),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(tourProgress).values({
      id: nanoid(),
      userId: ctx.user.id,
      organizationId: ctx.organizationId,
      tourId,
      status: "pending",
      currentStep: null,
    });
  }
}
