import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/actions";

import { MarketingLanding } from "./MarketingLanding";

export default async function HomePage() {
  const { currentUser } = await getCurrentUser();
  if (currentUser) redirect("/projects");
  return <MarketingLanding />;
}
