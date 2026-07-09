import type { ReactNode } from "react";

import { SettingsNav } from "./SettingsNav";

export default async function SettingsLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { id } = await params;
  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <SettingsNav projectId={id} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
