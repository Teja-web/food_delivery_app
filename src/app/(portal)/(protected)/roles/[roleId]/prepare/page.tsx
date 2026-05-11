import { redirect } from "next/navigation";

export default async function RolePreparePage({
  params,
  searchParams,
}: {
  params: Promise<{ roleId: string }>;
  searchParams: Promise<{ interview?: string }>;
}) {
  const { roleId } = await params;
  const { interview } = await searchParams;

  const qs = interview ? `?role=${roleId}&interview=${interview}` : `?role=${roleId}`;
  redirect(`/prepare${qs}`);
}
