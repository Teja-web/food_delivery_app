import { redirect } from "next/navigation";
import { getActionContext } from "@/lib/auth/context";
import { isUniversityOrg, listCampusInvites } from "@/operations/campus";
import { CampusInvitesClient } from "./CampusInvitesClient";

export default async function CampusInvitesPage() {
  const ctx = await getActionContext();
  const isUni = await isUniversityOrg(ctx.organizationId);
  if (!isUni) redirect("/recruit/settings");

  const invites = await listCampusInvites();
  return <CampusInvitesClient initialInvites={invites} />;
}
