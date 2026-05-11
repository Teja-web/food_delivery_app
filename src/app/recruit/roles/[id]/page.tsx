import { notFound } from "next/navigation";
import { fetchRoleDetail, listApplicationsForRole, listRecommendationsForRole, getRolePipelineSmartCounts, getRoleRecommendedSmartCounts, fetchRolePublicMeta, fetchRoleVisibilityContext } from "@/actions/roles";
import { fetchTriageItemsForRole, fetchTriageItemsForEntity } from "@/actions/triage";
import { fetchLatestNotePerEntity } from "@/actions/entity-notes";
import { serializeRoleDetail } from "./serialize";
import RoleDetailClient from "./RoleDetailClient";
import { RolePublicVisibilityCard } from "./RolePublicVisibilityCard";

const PAGE_SIZE = 25;

export default async function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [role, appPage, recPage, triageItems, allTriageItems, smartCounts, recSmartCounts, publicMeta, visibilityCtx] = await Promise.all([
    fetchRoleDetail(id),
    listApplicationsForRole(id, { offset: 0, limit: PAGE_SIZE }),
    listRecommendationsForRole(id, { offset: 0, limit: PAGE_SIZE }),
    fetchTriageItemsForRole(id),
    fetchTriageItemsForEntity("role", id),
    getRolePipelineSmartCounts(id),
    getRoleRecommendedSmartCounts(id),
    fetchRolePublicMeta(id),
    fetchRoleVisibilityContext(),
  ]);
  if (!role) return notFound();

  // Pre-fetch latest note per application in this page (single batched query).
  const appNotesMap = await fetchLatestNotePerEntity(
    "application",
    appPage.items.map((a) => a.id),
  );

  const props = serializeRoleDetail(role, appPage, recPage, triageItems, allTriageItems, appNotesMap, smartCounts, recSmartCounts);

  return (
    <>
      <RoleDetailClient {...props} />
      {publicMeta && (
        <div className="mx-auto max-w-6xl px-4 pb-8">
          <RolePublicVisibilityCard
            roleId={id}
            initialVisibility={publicMeta.publicVisibility}
            initialSlug={publicMeta.publicSlug}
            orgProfile={visibilityCtx.profile}
            bucket={visibilityCtx.bucket}
          />
        </div>
      )}
    </>
  );
}
