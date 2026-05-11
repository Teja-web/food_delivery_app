"use client";

import { useState, useTransition, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Flag,
  HandCoins,
  Loader2,
  Send,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AskAIButton } from "@/components/shared/ask-ai-button";
import { Pagination } from "@/components/shared/pagination";
import { useEntityEvent } from "@/hooks/use-entity-event";
import { editOffer, listInProgressOffers, listClosedWonOffers, listClosedLostOffers } from "@/actions/offers";
import { serializeListOffer } from "./serialize";
import type { SerializedListOffer, OffersListProps } from "./serialize";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 25;

/* -- Helpers --------------------------------------------------------- */

function outcomeColor(status: string) {
  return status === "accepted" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : status === "declined" ? "text-red-600 bg-red-50 border-red-200" : "text-muted-foreground bg-secondary border-border";
}

function statusColor(status: string) {
  if (status === "sent") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "negotiating") return "border-purple-200 bg-purple-50 text-purple-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const OFFER_TABS = ["In Progress", "Closed Won", "Closed Lost", "All"] as const;
type OfferTab = typeof OFFER_TABS[number];

/* -- Active Offer Card ----------------------------------------------- */

function ActiveOfferCard({ offer }: { offer: SerializedListOffer }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const isSent = offer.status === "sent";

  const handleStatusChange = (newStatus: "sent" | "accepted" | "declined") => {
    setPendingAction(newStatus);
    startTransition(async () => {
      try {
        const updates: Record<string, unknown> = { status: newStatus };
        if (newStatus === "sent") updates.sentAt = new Date().toISOString();
        if (newStatus === "accepted") updates.acceptedAt = new Date().toISOString();
        if (newStatus === "declined") updates.declinedAt = new Date().toISOString();
        await editOffer(offer.id, updates);
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  };

  return (
    <div className="tour-offer-card rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-start justify-between gap-4">
          <Link href={`/recruit/offers/${offer.id}`} className="group hover:opacity-80 transition-opacity">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground group-hover:underline">{offer.candidateName || "Unknown candidate"}</h2>
              <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize", statusColor(offer.status))}>{offer.status}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {offer.roleName || "Unknown role"}
            </p>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            {isSent ? (
              <>
                <Button
                  variant="unstyled"
                  onClick={() => handleStatusChange("accepted")}
                  disabled={isPending}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  {pendingAction === "accepted" ? <Loader2 size={12} className="shrink-0 animate-spin" /> : <ThumbsUp size={12} className="shrink-0" />}
                  Accepted
                </Button>
                <Button
                  variant="unstyled"
                  onClick={() => handleStatusChange("declined")}
                  disabled={isPending}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  {pendingAction === "declined" ? <Loader2 size={12} className="shrink-0 animate-spin" /> : <ThumbsDown size={12} className="shrink-0" />}
                  Declined
                </Button>
              </>
            ) : (
              <Button
                variant="default"
                onClick={() => handleStatusChange("sent")}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {pendingAction === "sent" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Approve &amp; send offer
              </Button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

/* -- Component ------------------------------------------------------- */

export default function OffersClient({ inProgress: initialInProgress, inProgressTotal: initialInProgressTotal, closedWon: initialClosedWon, closedWonTotal: initialClosedWonTotal, closedLost: initialClosedLost, closedLostTotal: initialClosedLostTotal }: OffersListProps) {
  const [activeTab, setActiveTab] = useState<OfferTab>("In Progress");
  const [inProgress, setInProgress] = useState(initialInProgress);
  const [inProgressTotal, setInProgressTotal] = useState(initialInProgressTotal);
  const [inProgressPage, setInProgressPage] = useState(1);
  const [closedWon, setClosedWon] = useState(initialClosedWon);
  const [closedWonTotal, setClosedWonTotal] = useState(initialClosedWonTotal);
  const [closedWonPage, setClosedWonPage] = useState(1);
  const [closedLost, setClosedLost] = useState(initialClosedLost);
  const [closedLostTotal, setClosedLostTotal] = useState(initialClosedLostTotal);
  const [closedLostPage, setClosedLostPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const inProgressTotalPages = Math.max(1, Math.ceil(inProgressTotal / PAGE_SIZE));
  const closedWonTotalPages = Math.max(1, Math.ceil(closedWonTotal / PAGE_SIZE));
  const closedLostTotalPages = Math.max(1, Math.ceil(closedLostTotal / PAGE_SIZE));
  const inProgressPageRef = useRef(inProgressPage);
  inProgressPageRef.current = inProgressPage;
  const closedWonPageRef = useRef(closedWonPage);
  closedWonPageRef.current = closedWonPage;
  const closedLostPageRef = useRef(closedLostPage);
  closedLostPageRef.current = closedLostPage;

  const fetchInProgressPage = useCallback((page: number) => {
    startTransition(async () => {
      const result = await listInProgressOffers({ offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE });
      setInProgress(result.items.map((o: any) => serializeListOffer(o)));
      setInProgressTotal(result.total);
    });
  }, []);

  const fetchClosedWonPage = useCallback((page: number) => {
    startTransition(async () => {
      const result = await listClosedWonOffers({ offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE });
      setClosedWon(result.items.map((o: any) => serializeListOffer(o)));
      setClosedWonTotal(result.total);
    });
  }, []);

  const fetchClosedLostPage = useCallback((page: number) => {
    startTransition(async () => {
      const result = await listClosedLostOffers({ offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE });
      setClosedLost(result.items.map((o: any) => serializeListOffer(o)));
      setClosedLostTotal(result.total);
    });
  }, []);

  useEntityEvent(["offer"], undefined, () => {
    fetchInProgressPage(inProgressPageRef.current);
    fetchClosedWonPage(closedWonPageRef.current);
    fetchClosedLostPage(closedLostPageRef.current);
  });

  const allPast = [...closedWon, ...closedLost];
  const allPastTotal = closedWonTotal + closedLostTotal;

  const showInProgress = activeTab === "In Progress" || activeTab === "All";
  const showPast = activeTab !== "In Progress";
  const filteredPast = activeTab === "All" ? allPast : activeTab === "Closed Won" ? closedWon : activeTab === "Closed Lost" ? closedLost : [];
  const filteredPastTotal = activeTab === "All" ? allPastTotal : activeTab === "Closed Won" ? closedWonTotal : activeTab === "Closed Lost" ? closedLostTotal : 0;
  const filteredPastPage = activeTab === "Closed Won" ? closedWonPage : activeTab === "Closed Lost" ? closedLostPage : 1;
  const filteredPastTotalPages = activeTab === "Closed Won" ? closedWonTotalPages : activeTab === "Closed Lost" ? closedLostTotalPages : 1;
  const handlePastPageChange = activeTab === "Closed Won"
    ? (p: number) => { setClosedWonPage(p); fetchClosedWonPage(p); }
    : activeTab === "Closed Lost"
    ? (p: number) => { setClosedLostPage(p); fetchClosedLostPage(p); }
    : () => {};

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <HandCoins className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Offers</span>
              </div>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">{inProgressTotal} in progress, {allPastTotal} closed</h1>
              <p className="mt-1 text-sm text-muted-foreground">Manage close plans and review offer history.</p>
            </div>
            <AskAIButton entity="offer" view="list" />
          </div>

          <div id="tour-offers-tabs" className="flex items-center rounded-lg border border-border bg-card p-0.5 w-fit">
            {OFFER_TABS.map((tab) => {
              const count = tab === "In Progress" ? inProgressTotal : tab === "Closed Won" ? closedWonTotal : tab === "Closed Lost" ? closedLostTotal : inProgressTotal + allPastTotal;
              return (
                <Button key={tab} variant="pill" onClick={() => setActiveTab(tab)} data-active={activeTab === tab || undefined}>
                  {tab} <span className="tabular-nums">{count}</span>
                </Button>
              );
            })}
          </div>

          {showInProgress && inProgress.length > 0 && (
            <div className={cn("space-y-4", isPending && "opacity-60 transition-opacity")}>
              {inProgress.map((offer) => <ActiveOfferCard key={offer.id} offer={offer} />)}
              <Pagination page={inProgressPage} totalPages={inProgressTotalPages} total={inProgressTotal} pageSize={PAGE_SIZE} isPending={isPending} label="in-progress offers" onPageChange={(p) => { setInProgressPage(p); fetchInProgressPage(p); }} />
            </div>
          )}

          {showInProgress && inProgress.length === 0 && activeTab === "In Progress" && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-8 text-center">
              <HandCoins className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs font-semibold text-foreground">No offers in progress</p>
              <p className="text-xs text-muted-foreground">Offers will appear here when candidates reach the offer stage.</p>
            </div>
          )}

          {showPast && filteredPast.length > 0 && (
            <div className={cn("space-y-3", isPending && "opacity-60 transition-opacity")}>
              {activeTab === "All" && <h2 className="text-sm font-semibold text-foreground">Closed offers</h2>}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr_80px_140px_90px_20px] gap-4 border-b border-border bg-secondary/50 px-5 py-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Candidate</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Role</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Outcome</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reason</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Closed</span>
                  <span />
                </div>
                {filteredPast.map((o) => (
                  <Link key={o.id} href={`/recruit/offers/${o.id}`} className="group grid grid-cols-[1fr_1fr_80px_140px_90px_20px] gap-4 border-b border-border/60 px-5 py-3 last:border-b-0 hover:bg-secondary/30 transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate group-hover:underline">{o.candidateName || "Unknown"}</p>
                      <p className="text-[11px] text-muted-foreground">{o.compBase || ""}</p>
                    </div>
                    <p className="self-center text-xs text-muted-foreground truncate">{o.roleName || "Unknown"}</p>
                    <span className={cn("self-center rounded-full border px-2 py-0.5 text-[10px] font-semibold text-center capitalize", outcomeColor(o.status))}>{o.status}</span>
                    <span className="self-center text-[11px] text-muted-foreground truncate">
                      {o.declineReason ? (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600 capitalize">
                          {o.declineReason.reason.replace("_", " ")}
                          {o.declineReason.competingCompany ? `: ${o.declineReason.competingCompany}` : ""}
                        </span>
                      ) : o.status === "accepted" ? (
                        <span className="text-[10px] text-emerald-600">-</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">-</span>
                      )}
                    </span>
                    <span className="self-center text-[11px] text-muted-foreground">{formatDate(o.respondedAt || o.acceptedAt || o.declinedAt)}</span>
                    <ChevronRight className="self-center h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                  </Link>
                ))}
              </div>
              {activeTab !== "All" && filteredPastTotalPages > 1 && (
                <Pagination page={filteredPastPage} totalPages={filteredPastTotalPages} total={filteredPastTotal} pageSize={PAGE_SIZE} isPending={isPending} label="offers" onPageChange={handlePastPageChange} />
              )}
            </div>
          )}

          {showPast && filteredPast.length === 0 && activeTab !== "All" && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-8 text-center">
              <HandCoins className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs font-semibold text-foreground">No {activeTab.toLowerCase()} offers</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
