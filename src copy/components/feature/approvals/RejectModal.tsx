"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const COMMON_REASONS = [
  "Needs more context",
  "Risk concern — escalate",
  "Owner ambiguity",
  "Scope creep",
  "Stale — request fresh evaluation",
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  approvalTitle: string;
  onConfirm: (reason: string) => Promise<void> | void;
};

export function RejectModal({ open, onOpenChange, approvalTitle, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("");
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!reason.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject approval</DialogTitle>
          <DialogDescription className="truncate">{approvalTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Common reasons
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="reject-reason"
              className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
            >
              Reason <span className="text-state-failed">*</span>
            </label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this can't be approved as-is"
              rows={4}
              required
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!reason.trim() || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Rejecting…" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
