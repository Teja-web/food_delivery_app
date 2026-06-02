"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { approveApproval, rejectApproval } from "@/actions/approvals";
import { RejectModal } from "@/components/feature/approvals/RejectModal";
import { Button } from "@/components/ui/button";

type Props = {
  approvalId: string;
  planTitle: string;
};

export function ApprovalActions({ approvalId, planTitle }: Props) {
  const router = useRouter();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleApprove = () => {
    startTransition(async () => {
      try {
        await approveApproval(approvalId);
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
            await rejectApproval(approvalId, reason);
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
