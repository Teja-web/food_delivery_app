import type { ReactNode } from "react";

import { GovernanceNav } from "./GovernanceNav";

export default async function GovernanceLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <GovernanceNav projectId={id} />
      <div>{children}</div>
    </div>
  );
}
