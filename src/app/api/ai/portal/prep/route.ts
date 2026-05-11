/**
 * Portal Prep AI Route
 *
 * Generates candidate-facing practice questions from the interview plan.
 * Saves to interview_mock_sessions so all prep lives alongside the interview.
 */

import { NextResponse } from "next/server";
import { requireCandidateContext } from "@/lib/auth/context";
import { db } from "@/db/client";
import { interviews, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generatePracticeQuestions, generateRolePracticeQuestions } from "@/domain/portal/prep";
import { saveMockSession } from "@/operations/portal";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const ctx = await requireCandidateContext();
    const primary = ctx.linkedCandidates[0];

    if (!primary) {
      return NextResponse.json({ error: "No linked candidate" }, { status: 404 });
    }

    const body = await request.json();
    const { action, interviewId, roleId, mode } = body;

    if (action !== "questions") {
      return NextResponse.json(
        { error: "Invalid action. Supported: questions" },
        { status: 400 },
      );
    }

    if (!interviewId && !roleId) {
      return NextResponse.json(
        { error: "interviewId or roleId is required" },
        { status: 400 },
      );
    }

    // Org derives from the role/interview being prepped for, not the
    // candidate's creator stamp (Phase 2 of vendor-and-attribution-plan.md).
    let organizationId: string;
    if (interviewId) {
      const iv = await db.query.interviews.findFirst({
        where: eq(interviews.id, interviewId),
        columns: { organizationId: true },
      });
      if (!iv) {
        return NextResponse.json({ error: "Interview not found" }, { status: 404 });
      }
      organizationId = iv.organizationId;
    } else {
      const role = await db.query.roles.findFirst({
        where: eq(roles.id, roleId),
        columns: { organizationId: true },
      });
      if (!role) {
        return NextResponse.json({ error: "Role not found" }, { status: 404 });
      }
      organizationId = role.organizationId;
    }

    const practiceMode = mode ?? "practice";

    // Generate questions — interview-scoped or role-scoped
    const result = interviewId
      ? await generatePracticeQuestions({
          organizationId,
          interviewId,
          candidateId: primary.id,
          mode: practiceMode,
        })
      : await generateRolePracticeQuestions({
          organizationId,
          roleId,
          candidateId: primary.id,
          mode: practiceMode,
        });

    if (!result.success) {
      return NextResponse.json(
        { error: "Interview prep is still being generated. Please try again in a moment." },
        { status: 409 },
      );
    }

    const { plan } = result;
    const questions = plan.questions ?? [];

    if (questions.length === 0) {
      return NextResponse.json(
        { error: "No questions generated" },
        { status: 500 },
      );
    }

    // Save to interview_mock_sessions
    const sessionQuestions = questions.map(
      (q: { question: string; category: string; hint?: string; whyThisMatters?: string }) => ({
        question: q.question,
        answer: "",
        category: q.category,
        hint: q.hint,
        whyThisMatters: q.whyThisMatters,
      }),
    );

    const type = practiceMode === "rapid_fire" ? "rapid_fire" as const : "practice" as const;

    const { id: sessionId } = await saveMockSession({
      organizationId,
      interviewId: interviewId ?? null,
      roleId: roleId ?? null,
      candidateId: primary.id,
      type,
      questions: sessionQuestions,
    });

    return NextResponse.json({
      success: true,
      sessionId,
      questionCount: sessionQuestions.length,
      mode: practiceMode,
    });
  } catch (error) {
    console.error("[Portal Prep] Error:", error);
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
