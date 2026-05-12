"use client";

import { Check, Sparkles, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { AutonomyPill } from "@/components/trust/AutonomyPill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { RejectModal } from "./RejectModal";
import type { ApprovalRowClient, ApprovalsInboxClient } from "./serialize";

type Tab = "mine" | "team" | "all";

type Props = {
  data: ApprovalsInboxClient;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onBulkApprove: (ids: string[]) => Promise<void>;
};

const ENTITY_ACCENT: Record<ApprovalRowClient["entityType"], string> = {
  plan: "border-autonomy-junior/40 text-autonomy-junior",
  phase_gate: "border-state-pending/40 text-state-pending",
  release: "border-autonomy-principal/40 text-autonomy-principal",
  work_item: "border-autonomy-senior/40 text-autonomy-senior",
};

const ENTITY_LABEL: Record<ApprovalRowClient["entityType"], string> = {
  plan: "PLAN",
  phase_gate: "GATE",
  release: "RELEASE",
  work_item: "WORK",
};

function ApprovalRow({
  row,
  selected,
  onSelect,
  onApprove,
  onReject,
  pending,
}: {
  row: ApprovalRowClient;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onApprove: (row: ApprovalRowClient) => void;
  onReject: (row: ApprovalRowClient) => void;
  pending: boolean;
}) {
  return (
    <div
      className={cn(
        "group grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-3 border-b border-border/40 px-4 py-3 transition-opacity",
        pending && "opacity-50",
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onSelect(row.id, e.target.checked)}
        aria-label={`Select ${row.title}`}
        className="mt-1.5 h-3.5 w-3.5 cursor-pointer"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn("px-1.5 py-0 font-mono text-[10px] uppercase", ENTITY_ACCENT[row.entityType])}
          >
            {ENTITY_LABEL[row.entityType]}
          </Badge>
          <span className="truncate text-sm font-medium">{row.title}</span>
          {row.autoEligible ? (
            <Badge
              variant="outline"
              className="shrink-0 border-trend-up/40 bg-trend-up/10 px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-trend-up"
              title={row.autoReason}
            >
              <Sparkles className="h-2.5 w-2.5" aria-hidden /> Auto ✓
            </Badge>
          ) : null}
          {row.isStale ? (
            <Badge
              variant="outline"
              className="shrink-0 border-state-pending/40 bg-state-pending/10 px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-state-pending"
            >
              Stale {row.ageDays}d
            </Badge>
          ) : null}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          {row.isBotRequester && row.skillLevel ? (
            <AutonomyPill level={row.skillLevel}>{row.requestedByName}</AutonomyPill>
          ) : row.isBotRequester ? (
            <Badge
              variant="outline"
              className="px-1.5 py-0 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground"
              title="Originating skill not yet on the autonomy ledger"
            >
              {row.requestedByName}
            </Badge>
          ) : (
            <span className="font-medium text-foreground/85">{row.requestedByName}</span>
          )}
          <span>·</span>
          <span>{row.ageLabel}</span>
          {row.phase ? (
            <>
              <span>·</span>
              <span className="font-mono uppercase tracking-wide">{row.phase}</span>
            </>
          ) : null}
        </div>
        {row.requesterNote && row.title !== row.requesterNote ? (
          <p className="mt-1 truncate text-[12px] text-muted-foreground">
            {row.requesterNote}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-trend-up/40 text-trend-up hover:bg-trend-up/10"
          onClick={() => onApprove(row)}
          disabled={pending}
          aria-label="Approve"
        >
          <Check className="h-3.5 w-3.5" aria-hidden /> Approve
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-trend-down/40 text-trend-down hover:bg-trend-down/10"
          onClick={() => onReject(row)}
          disabled={pending}
          aria-label="Reject"
        >
          <X className="h-3.5 w-3.5" aria-hidden /> Reject
        </Button>
      </div>
    </div>
  );
}

export function ApprovalsInbox({ data, onApprove, onReject, onBulkApprove }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<ApprovalRowClient | null>(null);
  const [, startTransition] = useTransition();

  const visible = useMemo(() => {
    if (tab === "all") return data.approvals;
    if (tab === "team") return data.approvals;
    // Mine = approver list contains me OR requester is me. We don't have
    // approverIds in the row client right now, so v1 just filters to
    // bot-requested + auto-eligible (the rows Sam is supposed to clear).
    return data.approvals.filter((a) => a.autoEligible || a.isBotRequester);
  }, [data.approvals, tab]);

  const eligibleSelected = useMemo(
    () => visible.filter((r) => selected.has(r.id) && r.autoEligible).length,
    [visible, selected],
  );
  const eligibleAllVisible = visible.filter((r) => r.autoEligible);

  const markPending = (id: string, on: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleApprove = (row: ApprovalRowClient) => {
    markPending(row.id, true);
    startTransition(async () => {
      try {
        await onApprove(row.id);
        toast.success(`Approved ${row.title}`);
      } catch (e) {
        toast.error(`Failed to approve: ${e instanceof Error ? e.message : "unknown error"}`);
      } finally {
        markPending(row.id, false);
      }
    });
  };

  const handleReject = (row: ApprovalRowClient) => {
    setRejectTarget(row);
  };

  const handleBulkApproveEligible = () => {
    const ids = (selected.size === 0 ? eligibleAllVisible : visible.filter((r) => selected.has(r.id) && r.autoEligible)).map((r) => r.id);
    if (ids.length === 0) return;
    ids.forEach((id) => markPending(id, true));
    startTransition(async () => {
      try {
        await onBulkApprove(ids);
        toast.success(`Approved ${ids.length} eligible item${ids.length === 1 ? "" : "s"}`);
        setSelected(new Set());
      } catch (e) {
        toast.error(`Bulk approve failed: ${e instanceof Error ? e.message : "unknown error"}`);
      } finally {
        ids.forEach((id) => markPending(id, false));
      }
    });
  };

  const onSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Approvals</h1>
        <div className="text-xs text-muted-foreground">
          {data.approvals.length} pending in your org
        </div>
      </header>

      <div className="flex items-center justify-between gap-3 border-b">
        <nav className="flex">
          {(["all", "team", "mine"] as Tab[]).map((t) => {
            const count = t === "all" ? data.tabs.all : t === "team" ? data.tabs.team : data.tabs.mine;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "border-b-2 px-3 py-2 text-sm capitalize transition-colors",
                  tab === t
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t} <span className="ml-1 font-mono text-[11px] opacity-60 tabular-nums">{count}</span>
              </button>
            );
          })}
        </nav>
        {(eligibleSelected > 0 || eligibleAllVisible.length > 0) && selected.size === 0 ? (
          <Button size="sm" onClick={handleBulkApproveEligible}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Approve eligible ({eligibleAllVisible.length})
          </Button>
        ) : eligibleSelected > 0 ? (
          <Button size="sm" onClick={handleBulkApproveEligible}>
            Approve {eligibleSelected} eligible
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border bg-card/30 px-6 py-12 text-center text-sm text-muted-foreground">
          Inbox zero. Nothing pending in this view.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card/30">
          {visible.map((row) => (
            <ApprovalRow
              key={row.id}
              row={row}
              selected={selected.has(row.id)}
              onSelect={onSelect}
              onApprove={handleApprove}
              onReject={handleReject}
              pending={pendingIds.has(row.id)}
            />
          ))}
        </div>
      )}

      <RejectModal
        open={!!rejectTarget}
        onOpenChange={(o) => {
          if (!o) setRejectTarget(null);
        }}
        approvalTitle={rejectTarget?.title ?? ""}
        onConfirm={async (reason) => {
          if (!rejectTarget) return;
          const target = rejectTarget;
          markPending(target.id, true);
          try {
            await onReject(target.id, reason);
            toast.success(`Rejected ${target.title}`);
          } catch (e) {
            toast.error(`Failed to reject: ${e instanceof Error ? e.message : "unknown error"}`);
          } finally {
            markPending(target.id, false);
          }
        }}
      />
    </div>
  );
}
