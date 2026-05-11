import { fetchInterview } from "@/actions/interviews";
import { notFound } from "next/navigation";
import ScorecardClient from "./ScorecardClient";

export default async function ScorecardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const interview = await fetchInterview(id);

  if (!interview) notFound();

  const iv = interview as any;
  const competencies: string[] = iv.stage?.competencies ?? [];
  const scorecards = (iv.scorecards ?? []).map((sc: any) => ({
    id: sc.id,
    reviewerName: sc.reviewerName,
    overallRating: sc.overallRating,
    verdict: sc.verdict,
    notes: sc.notes,
    ratings: ((sc.ratings as any[]) ?? []).map((r: any) => ({
      competency: r.competency,
      rating: r.rating,
      evidence: r.evidence,
    })),
    createdAt: sc.createdAt instanceof Date ? sc.createdAt.toISOString() : String(sc.createdAt ?? ""),
  }));

  return (
    <ScorecardClient
      interviewId={iv.id}
      candidateName={iv.application?.candidate?.name ?? null}
      roleName={iv.application?.role?.title ?? null}
      interviewType={iv.interviewType ?? null}
      scheduledAt={iv.scheduledAt instanceof Date ? iv.scheduledAt.toISOString() : iv.scheduledAt ?? null}
      durationMins={iv.durationMins ?? 45}
      panelistNames={(iv.panelists ?? []).map((p: any) => p.user?.name ?? "Unknown").filter(Boolean)}
      evidenceTarget={iv.intelligence?.evidenceTarget ?? iv.evidenceTarget ?? null}
      competencies={competencies}
      existingScorecards={scorecards}
      status={iv.status}
    />
  );
}
