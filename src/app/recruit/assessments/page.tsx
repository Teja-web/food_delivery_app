import { listAssessments, listAssessmentAttempts, fetchAssessmentStats } from "@/actions/assessments";
import { serializeAssessmentsList } from "./serialize";
import AssessmentsClient from "./AssessmentsClient";

const PAGE_SIZE = 25;

export default async function AssessmentsPage() {
  const [assessmentsResult, attemptsResult, statsMap] = await Promise.all([
    listAssessments({ offset: 0, limit: PAGE_SIZE }),
    listAssessmentAttempts({ offset: 0, limit: PAGE_SIZE }),
    fetchAssessmentStats(),
  ]);

  const assessments = assessmentsResult?.items ?? [];
  const attempts = attemptsResult?.items ?? [];

  const props = serializeAssessmentsList(assessments, statsMap, attempts);
  // Override totals with actual DB counts (not just current page length)
  props.assessmentsTotal = assessmentsResult?.total ?? assessments.length;
  props.attemptsTotal = attemptsResult?.total ?? attempts.length;

  return <AssessmentsClient {...props} />;
}
