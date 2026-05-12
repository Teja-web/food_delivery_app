"use client";

import { useRouter } from "next/navigation";

import { approveApproval, bulkApproveApprovals, rejectApproval } from "@/actions/approvals";

import { ApprovalsInbox } from "./ApprovalsInbox";
import type { ApprovalsInboxClient } from "./serialize";

export function ApprovalsPageClient({ data }: { data: ApprovalsInboxClient }) {
  const router = useRouter();
  return (
    <ApprovalsInbox
      data={data}
      onApprove={async (id) => {
        await approveApproval(id);
        router.refresh();
      }}
      onReject={async (id, reason) => {
        await rejectApproval(id, reason);
        router.refresh();
      }}
      onBulkApprove={async (ids) => {
        await bulkApproveApprovals(ids);
        router.refresh();
      }}
    />
  );
}
