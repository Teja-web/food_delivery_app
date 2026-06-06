"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { decideGovernanceRecord } from "@/actions/governance/records";
import { RejectModal } from "@/components/feature/approvals/RejectModal";
import { Button } from "@/components/ui/button";

type Props = {
  /** governance_record id (kind=approval). */
  recordId: string;
  planTitle: string;
};

/**
 * Inline approve / reject buttons for a pending governance record.
 * Replaces the old approvals API — the underlying surface is now
 * `governance_records` rows with kind=approval.
 */
export function ApprovalActions({ recordId, planTitle }: Props) {
  const router = useRouter();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleApprove = () => {
    startTransition(async () => {
      try {
        await decideGovernanceRecord({ id: recordId, status: "passed" });
        toast.success("Approved");
        router.refresh();
      } catch (e) {
        toast.error(`Failed to approve: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    });
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="border-trend-up/40 text-trend-up hover:bg-trend-up/10"
          onClick={handleApprove}
          disabled={isPending}
        >
          <Check className="h-3.5 w-3.5" aria-hidden /> Approve
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-trend-down/40 text-trend-down hover:bg-trend-down/10"
          onClick={() => setRejectOpen(true)}
          disabled={isPending}
        >
          <X className="h-3.5 w-3.5" aria-hidden /> Reject
        </Button>
      </div>
      <RejectModal
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        approvalTitle={planTitle}
        onConfirm={async (reason) => {
          try {
            await decideGovernanceRecord({
              id: recordId,
              status: "failed",
              decisionNote: reason,
            });
            toast.success("Rejected");
            router.refresh();
          } catch (e) {
            toast.error(`Failed to reject: ${e instanceof Error ? e.message : "unknown error"}`);
            throw e;
          }
        }}
      />
    </>
  );
}
