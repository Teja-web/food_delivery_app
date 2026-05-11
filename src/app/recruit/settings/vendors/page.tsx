import { fetchVendorPartnerships } from "@/actions/vendor-partnerships";
import { VendorsClient } from "./VendorsClient";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const { partnerships, invitations } = await fetchVendorPartnerships();
  return <VendorsClient partnerships={partnerships} invitations={invitations} />;
}
