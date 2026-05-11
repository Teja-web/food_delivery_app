import { listRoles } from "@/actions/roles";
import { listTriageItems } from "@/actions/triage";
import { listInterviews } from "@/actions/interviews";
import { listPipelineStageCounts } from "@/actions/pipeline";
import { fetchMyActivityToday } from "@/actions/insights";
import { getCurrentUser } from "@/lib/auth/actions";
import {
  buildPipelineMap,
  serializeRole,
  serializeTriageItem,
  serializeInterview,
} from "./serialize";
import TodayClient from "./TodayDashboard";

export default async function TodayPage() {
  const userContext = await getCurrentUser();
  const organizationId = userContext.organizationId;
  const currentUserId = userContext.currentUser?.id;

  const [{ items: allRoles }, { items: allTriageItems }, { items: allInterviews }, pipelineCounts, myActivity] =
    await Promise.all([
      listRoles({ limit: 100 }),
      listTriageItems({ limit: 100 }),
      listInterviews({ limit: 100 }),
      listPipelineStageCounts(organizationId),
      fetchMyActivityToday(),
    ]);

  const pipelineMap = buildPipelineMap(pipelineCounts);

  // Show all open/draft roles to everyone
  const openRoles = (allRoles as any[]).filter(
    (r) => r.status === "open" || r.status === "draft",
  );
  const openRoleIds = new Set(openRoles.map((r: any) => r.id));

  // Show all active triage items (exclude daily briefings which are shown separately)
  const activeTriageItems = (allTriageItems as any[]).filter(
    (t) => t.status === "active" && t.type !== "daily_briefing",
  );

  // Extract daily briefing for this user
  const briefingItem = (allTriageItems as any[]).find(
    (t) => t.type === "daily_briefing" && t.status === "active" && t.candidateId === currentUserId,
  );
  const briefing: string | null = briefingItem?.title ?? null;

  // Filter today's interviews
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const todaysInterviews = (allInterviews as any[]).filter((iv) => {
    if (!iv.scheduledAt) return false;
    const scheduled = new Date(iv.scheduledAt);
    return scheduled >= todayStart && scheduled <= todayEnd && (iv.status === "proposed" || iv.status === "confirmed");
  });

  // Serialize
  const roles = openRoles.map((r: any) =>
    serializeRole(r, pipelineMap[r.id] || { sourced: 0, interview: 0, offer: 0 }),
  );
  const triageItems = activeTriageItems.map(serializeTriageItem);
  const interviews = todaysInterviews.map(serializeInterview);

  return (
    <TodayClient
      roles={roles}
      triageItems={triageItems}
      interviews={interviews}
      briefing={briefing}
      myActivity={myActivity}
    />
  );
}
