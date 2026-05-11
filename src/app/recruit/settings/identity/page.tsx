import { loadOrgIdentity } from "@/actions/org-identity";
import { loadOrgPublicProfile } from "@/actions/org-public-profile";
import { IdentityClient } from "./IdentityForm";
import { PublicProfileForm } from "./PublicProfileForm";

export default async function IdentityPage() {
  const [identity, publicProfile] = await Promise.all([
    loadOrgIdentity(),
    loadOrgPublicProfile(),
  ]);
  return (
    <div className="space-y-6">
      <IdentityClient initialIdentity={identity} />
      <PublicProfileForm initial={publicProfile} />
    </div>
  );
}
