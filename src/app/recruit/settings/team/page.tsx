import { listMembers, listInvitations } from "@/actions/team";
import { TeamClient } from "./TeamClient";

export default async function TeamPage() {
  const [members, invitations] = await Promise.all([
    listMembers(),
    listInvitations(),
  ]);

  return <TeamClient initialMembers={members} initialInvitations={invitations} />;
}
