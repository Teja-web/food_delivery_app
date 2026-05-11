import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";

export default async function PortalHome() {
  const userContext = await getCurrentUser();
  if (!userContext?.currentUser) {
    redirect("/auth/sign-in?mode=candidate");
  }
  const completed = Boolean(
    (userContext.currentUser as { hasCompletedOnboarding?: boolean })
      .hasCompletedOnboarding,
  );
  redirect(completed ? "/dashboard" : "/welcome");
}
