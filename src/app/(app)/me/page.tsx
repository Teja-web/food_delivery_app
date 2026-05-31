import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { getMeDashboard } from "@/operations/personal";
import { MePersonalDashboard } from "./MePersonalDashboard";

export default async function MePage() {
  const { currentUser, organizationId } = await getCurrentUser();
  if (!currentUser || !organizationId) redirect("/auth/sign-in");

  const data = await getMeDashboard(organizationId, currentUser.id);
  return <MePersonalDashboard data={data} userName={currentUser.name ?? currentUser.email ?? "you"} />;
}
