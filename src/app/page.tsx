import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";

export default async function HomePage() {
  const { currentUser } = await getCurrentUser();
  redirect(currentUser ? "/projects" : "/auth/sign-in");
}
