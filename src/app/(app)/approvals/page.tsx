import { and, desc, eq } from "drizzle-orm";

import { Toaster } from "@/components/ui/sonner";
import { db } from "@/db/client";
import { approvals, type Approval } from "@/db/schema/approval";
import { getActionContext } from "@/lib/auth/context";

import { ApprovalsPageClient } from "./ApprovalsPageClient";
import { serializeApprovalRow, type ApprovalsInboxClient } from "./serialize";

export default async function ApprovalsPage() {
  const ctx = await getActionContext();
  const rows: Approval[] = await db
    .select()
    .from(approvals)
    .where(
      and(eq(approvals.organizationId, ctx.organizationId), eq(approvals.status, "pending")),
    )
    .orderBy(desc(approvals.createdAt));

  const serialized = rows.map(serializeApprovalRow);

  const data: ApprovalsInboxClient = {
    tabs: {
      mine: serialized.filter((a) => a.autoEligible || a.isBotRequester).length,
      team: serialized.length,
      all: serialized.length,
    },
    approvals: serialized,
    currentUserId: ctx.userId,
  };

  return (
    <>
      <ApprovalsPageClient data={data} />
      <Toaster />
    </>
  );
}
