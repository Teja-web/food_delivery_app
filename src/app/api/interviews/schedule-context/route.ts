import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { interviewStages, applications, candidates, roles, member, oauthConnections } from "@/db/schema";
import { user } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getActionContext } from "@/lib/auth/context";

export async function GET(req: NextRequest) {
  const ctx = await getActionContext();
  const { searchParams } = req.nextUrl;
  const applicationId = searchParams.get("applicationId");
  const stageId = searchParams.get("stageId");
  const roleId = searchParams.get("roleId");

  if (!applicationId || !stageId || !roleId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  // Fetch stage info
  const [stage] = await db
    .select({
      id: interviewStages.id,
      name: interviewStages.name,
      type: interviewStages.type,
      durationMins: interviewStages.durationMins,
      competencies: interviewStages.competencies,
      order: interviewStages.order,
    })
    .from(interviewStages)
    .where(eq(interviewStages.id, stageId))
    .limit(1);

  // Fetch application with candidate and role names
  const [app] = await db
    .select({
      id: applications.id,
      candidateId: applications.candidateId,
      candidateName: candidates.name,
      roleId: applications.roleId,
      roleName: roles.title,
    })
    .from(applications)
    .innerJoin(candidates, eq(applications.candidateId, candidates.id))
    .innerJoin(roles, eq(applications.roleId, roles.id))
    .where(eq(applications.id, applicationId))
    .limit(1);

  // Fetch org members with calendar connection status
  const members = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      hasCalendar: sql<boolean>`${oauthConnections.id} IS NOT NULL`.as("has_calendar"),
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .leftJoin(
      oauthConnections,
      and(
        eq(oauthConnections.userId, user.id),
        eq(oauthConnections.category, "calendar"),
        eq(oauthConnections.status, "active")
      )
    )
    .where(eq(member.organizationId, ctx.organizationId));

  return NextResponse.json({
    stage: stage ?? null,
    application: app
      ? {
          id: app.id,
          candidateId: app.candidateId,
          candidateName: app.candidateName,
          roleId: app.roleId,
          roleName: app.roleName,
        }
      : null,
    members: members.map((m) => ({
      userId: m.userId,
      name: m.name,
      email: m.email,
      image: m.image,
      hasCalendar: !!m.hasCalendar,
    })),
  });
}
