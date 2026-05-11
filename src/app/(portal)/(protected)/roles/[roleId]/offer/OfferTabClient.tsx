"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ThumbsDown,
  MessageSquare,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEntityEvent } from "@/hooks/use-entity-event";
import { acceptPortalOffer, declinePortalOffer, counterPortalOffer } from "@/actions/portal";
import type { OfferCompState, OfferTriggerType, OfferChangeEntry, OfferDeclineReason } from "@/db/schema/offers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* -- Types ---------------------------------------------------------- */

interface PortalVersion {
  versionNumber: number;
  triggerType: OfferTriggerType;
  compState: OfferCompState;
  changeVector: { changes: OfferChangeEntry[] } | null;
  createdBy: string | null;
  createdAt: string;
}

interface PortalOffer {
  id: string;
  status: string;
  compState: OfferCompState | null;
  hikePercentage: number | null;
  validUntil: string | null;
  versions: PortalVersion[];
}

/* -- Helpers -------------------------------------------------------- */

function fmt(amount: number | null | undefined, currency?: string | null): string {
  if (amount == null) return "-";
  return `${currency ?? ""} ${amount.toLocaleString("en-IN")}`.trim();
}

const DECLINE_REASONS = [
  { value: "comp_gap", label: "Compensation" },
  { value: "competing_offer", label: "Other offer" },
  { value: "role_fit", label: "Role fit" },
  { value: "personal", label: "Personal" },
  { value: "timeline", label: "Timeline" },
  { value: "other", label: "Other" },
] as const;

/* Counter-offer: candidates edit comp numbers directly */

/* -- Component ------------------------------------------------------ */

export function OfferTabClient({
  offer,
  applicationId,
  currentCompTotalCtc,
  currentCompCurrency,
}: {
  offer: PortalOffer;
  applicationId: string;
  currentCompTotalCtc: number | null;
  currentCompCurrency: string | null;
}) {
  useEntityEvent(["offer"]);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<"offer" | "decline" | "counter">("offer");
  const [declineReason, setDeclineReason] = useState<OfferDeclineReason["reason"]>("comp_gap");
  const [declineNotes, setDeclineNotes] = useState("");
  const [counterComp, setCounterComp] = useState<OfferCompState | null>(null);
  const [counterNotes, setCounterNotes] = useState("");

  const comp = offer.compState;
  const isSent = offer.status === "sent";
  const isNegotiating = offer.status === "negotiating";
  const isClosed = offer.status === "accepted" || offer.status === "declined" || offer.status === "withdrawn";

  const handleAccept = () => {
    startTransition(async () => {
      await acceptPortalOffer(applicationId);
      router.refresh();
    });
  };

  const handleDecline = () => {
    startTransition(async () => {
      await declinePortalOffer(applicationId, { reason: declineReason, notes: declineNotes || undefined });
      router.refresh();
    });
  };

  const handleCounter = () => {
    if (!counterComp) return;
    startTransition(async () => {
      await counterPortalOffer(applicationId, {
        compState: counterComp,
        justification: counterNotes.trim() || undefined,
      });
      setView("offer");
      setCounterComp(null);
      setCounterNotes("");
      router.refresh();
    });
  };

  if (!comp) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
        <TrendingUp className="h-6 w-6 text-muted-foreground/30" />
        <p className="text-xs font-semibold text-foreground">Offer is being prepared</p>
        <p className="text-xs text-muted-foreground">Your offer details will appear here once ready.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Status */}
      {isClosed && (
        <div className={cn(
          "rounded-xl border px-4 py-3 text-xs font-semibold text-center capitalize",
          offer.status === "accepted" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600",
        )}>
          Offer {offer.status}
        </div>
      )}

      {isNegotiating && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-xs font-semibold text-center text-purple-700">
          Your response has been shared. The team is reviewing.
        </div>
      )}

      {/* Compensation Breakdown */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Compensation Breakdown</span>
            {offer.hikePercentage != null && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                +{offer.hikePercentage.toFixed(1)}% vs current
              </span>
            )}
          </div>
        </div>
        {comp.components.map((c) => (
          <div key={c.name} className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 last:border-b-0">
            <span className="text-xs text-muted-foreground">{c.name}</span>
            <span className="text-xs font-medium tabular-nums">{fmt(c.amount, comp.currency)}</span>
          </div>
        ))}
        {comp.bonus != null && (
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
            <span className="text-xs text-muted-foreground">Bonus / Variable</span>
            <span className="text-xs font-medium tabular-nums">{fmt(comp.bonus, comp.currency)}</span>
          </div>
        )}
        {comp.equity && (
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
            <span className="text-xs text-muted-foreground">Equity</span>
            <span className="text-xs font-medium">{comp.equity}</span>
          </div>
        )}
        <div className="flex items-center justify-between bg-secondary/50 px-4 py-3 border-t border-border">
          <span className="text-xs font-bold">Total CTC</span>
          <span className="text-xs font-bold tabular-nums">{fmt(comp.totalCtc, comp.currency)}</span>
        </div>
      </div>

      {/* Current vs Proposed */}
      {currentCompTotalCtc != null && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Current CTC</span>
            <span className="tabular-nums">{fmt(currentCompTotalCtc, currentCompCurrency)}</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-2">
            <span className="text-muted-foreground">Proposed CTC</span>
            <span className="font-semibold text-emerald-700 tabular-nums">{fmt(comp.totalCtc, comp.currency)}</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-border/60">
            <span className="text-muted-foreground">Increase</span>
            <span className="font-bold text-emerald-700 tabular-nums">
              {fmt(comp.totalCtc - currentCompTotalCtc, comp.currency)}
              {offer.hikePercentage != null && ` (+${offer.hikePercentage.toFixed(1)}%)`}
            </span>
          </div>
        </div>
      )}

      {/* Version History */}
      {offer.versions.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">History</p>
          <div className="space-y-2">
            {offer.versions.map((v) => (
              <div key={v.versionNumber} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">v{v.versionNumber}</span>
                  <span className="text-muted-foreground capitalize">{v.triggerType.replace("_", " ")}</span>
                </div>
                <span className="tabular-nums font-medium">{fmt(v.compState.totalCtc, v.compState.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deadline */}
      {offer.validUntil && (
        <p className="text-[11px] text-muted-foreground text-center">
          This offer is valid until {new Date(offer.validUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      )}

      {/* Actions */}
      {isSent && view === "offer" && (
        <div className="space-y-3">
          <Button
            variant="default"
            onClick={handleAccept}
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Accept Offer
          </Button>
          <div className="flex gap-3">
            <Button
              variant="soft"
              onClick={() => {
                if (comp) setCounterComp(JSON.parse(JSON.stringify(comp)));
                setView("counter");
              }}
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Negotiate
            </Button>
            <Button
              variant="soft"
              onClick={() => setView("decline")}
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold text-red-600 hover:text-red-700"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              Decline
            </Button>
          </div>
        </div>
      )}

      {/* Counter Flow — editable comp numbers */}
      {view === "counter" && counterComp && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30">
            <span className="text-xs font-semibold text-foreground">Edit your expected compensation</span>
          </div>
          {counterComp.components.map((c, i) => (
            <div key={c.name} className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 last:border-b-0">
              <span className="text-xs text-muted-foreground">{c.name}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{counterComp.currency}</span>
                <Input
                  type="number"
                  value={c.amount}
                  onChange={(e) => {
                    const updated = { ...counterComp };
                    updated.components = [...updated.components];
                    updated.components[i] = { ...c, amount: Number(e.target.value) || 0 };
                    updated.totalFixed = updated.components.reduce((s, x) => s + x.amount, 0);
                    updated.totalCtc = updated.totalFixed + (updated.bonus ?? 0);
                    setCounterComp(updated);
                  }}
                  className="w-28 h-7 text-xs text-right tabular-nums"
                />
              </div>
            </div>
          ))}
          {counterComp.bonus != null && (
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
              <span className="text-xs text-muted-foreground">Bonus / Variable</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{counterComp.currency}</span>
                <Input
                  type="number"
                  value={counterComp.bonus ?? 0}
                  onChange={(e) => {
                    const bonus = Number(e.target.value) || 0;
                    setCounterComp({ ...counterComp, bonus, totalCtc: counterComp.totalFixed + bonus });
                  }}
                  className="w-28 h-7 text-xs text-right tabular-nums"
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between bg-secondary/50 px-4 py-3 border-t border-border">
            <span className="text-xs font-bold">Total CTC</span>
            <span className="text-xs font-bold tabular-nums">{fmt(counterComp.totalCtc, counterComp.currency)}</span>
          </div>

          <div className="p-4 space-y-3">
            <textarea
              placeholder="Anything you'd like to share about your expectations (optional)"
              value={counterNotes}
              onChange={(e) => setCounterNotes(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              rows={2}
            />
            <div className="flex gap-2">
              <Button variant="soft" onClick={() => { setView("offer"); setCounterComp(null); }} disabled={isPending} className="flex-1 text-xs py-2">
                Cancel
              </Button>
              <Button variant="default" onClick={handleCounter} disabled={isPending} className="flex-1 text-xs py-2">
                {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Submit Counter
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Flow */}
      {view === "decline" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <p className="text-sm font-semibold text-foreground">We're sorry to hear that. Could you share why?</p>
          <div className="grid grid-cols-3 gap-2">
            {DECLINE_REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setDeclineReason(r.value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  declineReason === r.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <textarea
            placeholder="Any additional feedback (optional)"
            value={declineNotes}
            onChange={(e) => setDeclineNotes(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            rows={2}
          />
          <div className="flex gap-2">
            <Button variant="soft" onClick={() => setView("offer")} disabled={isPending} className="flex-1 text-xs py-2">
              Cancel
            </Button>
            <Button variant="default" onClick={handleDecline} disabled={isPending} className="flex-1 text-xs py-2 bg-red-600 hover:bg-red-700">
              {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Confirm decline
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
