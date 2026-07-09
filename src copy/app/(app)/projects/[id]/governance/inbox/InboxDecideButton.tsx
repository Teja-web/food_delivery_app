"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { decideGovernanceRecord } from "@/actions/governance/records";
import { Button } from "@/components/ui/button";

export function InboxDecideButton({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const decide = (status: "passed" | "failed") => {
    startTransition(async () => {
      try {
        await decideGovernanceRecord({ id: recordId, status });
        toast.success(status === "passed" ? "Approved" : "Rejected");
        router.refresh();
      } catch (e) {
        toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    });
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => decide("passed")}
        className="h-7 border-trend-up/40 text-trend-up hover:bg-trend-up/10"
      >
        <Check className="h-3 w-3" aria-hidden /> Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => decide("failed")}
        className="h-7 border-trend-down/40 text-trend-down hover:bg-trend-down/10"
      >
        <X className="h-3 w-3" aria-hidden /> Reject
      </Button>
    </div>
  );
}
