"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  FileText,
  Loader2,
  Sparkles,
  CheckCircle2,
  Flag,
  TrendingUp,
  Send,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  Pencil,
  Plus,
  Trash2,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEntityEvent } from "@/hooks/use-entity-event";
import { uploadOfferLetter, uploadPayStubs, generateOfferManual, editOffer, sendOffer, reviseOffer, withdrawOffer } from "@/actions/offers";
import type { SerializedOfferDetail, SerializedOfferVersion } from "./serialize";
import type { ExtractedOfferLetter, ExtractedPayStub, GeneratedOffer, CompComponent, OfferCompState, OfferTriggerType, OfferDeclineReason, OfferWithdrawReason } from "@/db/schema/offers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/* -- Helpers ------------------------------------------------------- */

function fmt(amount: number | null | undefined, currency?: string | null): string {
  if (amount == null) return "-";
  const c = currency ?? "";
  return `${c} ${amount.toLocaleString("en-IN")}`.trim();
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusColor(status: string) {
  if (status === "accepted") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status === "declined" || status === "withdrawn") return "text-red-600 bg-red-50 border-red-200";
  if (status === "sent") return "text-blue-700 bg-blue-50 border-blue-200";
  if (status === "negotiating") return "text-purple-700 bg-purple-50 border-purple-200";
  return "text-amber-700 bg-amber-50 border-amber-200";
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">{children}</p>;
}

function CompTable({ components, currency, label }: { components: CompComponent[]; currency?: string | null; label: string }) {
  if (!components.length) return null;
  const total = components.reduce((s, c) => s + c.amount, 0);
  return (
    <div>
      <SectionHeader>{label}</SectionHeader>
      <div className="rounded-xl border border-border bg-background overflow-hidden">
        {components.map((c) => (
          <div key={c.name} className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 last:border-b-0">
            <span className="text-xs text-muted-foreground">{c.name}</span>
            <span className="text-xs font-medium tabular-nums">{fmt(c.amount, currency)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between bg-secondary/50 px-4 py-2.5 border-t border-border">
          <span className="text-xs font-semibold">Total</span>
          <span className="text-xs font-bold tabular-nums">{fmt(total, currency)}</span>
        </div>
      </div>
    </div>
  );
}

/* -- Upload Zone --------------------------------------------------- */

function UploadZone({
  label,
  hint,
  multiple,
  isUploaded,
  fileName,
  onUpload,
  isLoading,
}: {
  label: string;
  hint: string;
  multiple?: boolean;
  isUploaded: boolean;
  fileName?: string | null;
  onUpload: (files: FileList) => void;
  isLoading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        "rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer hover:border-primary/40 hover:bg-primary/5",
        isUploaded ? "border-emerald-300 bg-emerald-50/30" : "border-border",
        isLoading && "pointer-events-none opacity-60",
      )}
      onClick={() => inputRef.current?.click()}
    >
      <Input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        multiple={multiple}
        className="hidden"
        onChange={(e) => e.target.files && onUpload(e.target.files)}
      />
      {isLoading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Extracting...</p>
        </div>
      ) : isUploaded ? (
        <div className="flex flex-col items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          <p className="text-xs font-medium text-emerald-700">{fileName || "Uploaded"}</p>
          <p className="text-[10px] text-muted-foreground">Click to replace</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-6 w-6 text-muted-foreground/40" />
          <p className="text-xs font-semibold text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        </div>
      )}
    </div>
  );
}

/* -- Comparison View ----------------------------------------------- */

function ComparisonView({
  current,
  proposed,
}: {
  current: ExtractedOfferLetter;
  proposed: GeneratedOffer;
}) {
  return (
    <div>
      <SectionHeader>Current vs Proposed</SectionHeader>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Current CTC</p>
          <div className="rounded-xl border border-border bg-background overflow-hidden">
            {current.components.map((c) => (
              <div key={c.name} className="flex justify-between border-b border-border/60 px-3 py-2 last:border-b-0">
                <span className="text-[11px] text-muted-foreground">{c.name}</span>
                <span className="text-[11px] tabular-nums">{fmt(c.amount, current.currency)}</span>
              </div>
            ))}
            {current.variableBonus != null && (
              <div className="flex justify-between border-b border-border/60 px-3 py-2">
                <span className="text-[11px] text-muted-foreground">Variable Bonus</span>
                <span className="text-[11px] tabular-nums">{fmt(current.variableBonus, current.currency)}</span>
              </div>
            )}
            <div className="flex justify-between bg-secondary/50 px-3 py-2 border-t border-border">
              <span className="text-[11px] font-bold">Total CTC</span>
              <span className="text-[11px] font-bold tabular-nums">{fmt(current.totalCtc, current.currency)}</span>
            </div>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Proposed CTC</p>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              +{proposed.hike.percentage.toFixed(1)}%
            </span>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/20 overflow-hidden">
            {proposed.components.map((c) => (
              <div key={c.name} className="flex justify-between border-b border-emerald-100 px-3 py-2 last:border-b-0">
                <span className="text-[11px] text-muted-foreground">{c.name}</span>
                <span className="text-[11px] tabular-nums font-medium">{fmt(c.amount, proposed.currency)}</span>
              </div>
            ))}
            {proposed.bonus != null && (
              <div className="flex justify-between border-b border-emerald-100 px-3 py-2">
                <span className="text-[11px] text-muted-foreground">Bonus</span>
                <span className="text-[11px] tabular-nums font-medium">{fmt(proposed.bonus, proposed.currency)}</span>
              </div>
            )}
            <div className="flex justify-between bg-emerald-100/50 px-3 py-2 border-t border-emerald-200">
              <span className="text-[11px] font-bold">Total CTC</span>
              <span className="text-[11px] font-bold tabular-nums text-emerald-700">{fmt(proposed.totalCtc, proposed.currency)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -- Negotiation Range Bar ----------------------------------------- */

function NegotiationBar({ generated, roleBand }: { generated: GeneratedOffer; roleBand: { min?: number; max?: number } | null }) {
  const floor = generated.negotiationRange.floor;
  const ceiling = generated.negotiationRange.ceiling;
  const recommended = generated.totalCtc;
  const bandMin = roleBand?.min ?? floor;
  const bandMax = roleBand?.max ?? ceiling;
  const range = bandMax - bandMin || 1;

  const floorPct = Math.max(0, Math.min(100, ((floor - bandMin) / range) * 100));
  const recPct = Math.max(0, Math.min(100, ((recommended - bandMin) / range) * 100));
  const ceilPct = Math.max(0, Math.min(100, ((ceiling - bandMin) / range) * 100));

  return (
    <div>
      <SectionHeader>Negotiation Range</SectionHeader>
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="relative h-3 rounded-full bg-secondary mb-4">
          <div
            className="absolute top-0 h-3 rounded-full bg-gradient-to-r from-amber-200 via-emerald-300 to-emerald-200"
            style={{ left: `${floorPct}%`, width: `${ceilPct - floorPct}%` }}
          />
          <div
            className="absolute top-0 h-3 w-1 bg-emerald-600 rounded"
            style={{ left: `${recPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Floor: {fmt(floor, generated.currency)}</span>
          <span className="font-semibold text-emerald-700">Recommended: {fmt(recommended, generated.currency)}</span>
          <span>Ceiling: {fmt(ceiling, generated.currency)}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
            generated.competitivePosition === "above-band" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : generated.competitivePosition === "at-band" ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          )}>
            {generated.competitivePosition.replace("-", " ")}
          </span>
        </div>
      </div>
    </div>
  );
}

/* -- Version Timeline ----------------------------------------------- */

const TRIGGER_LABELS: Record<OfferTriggerType, string> = {
  initial: "Initial offer",
  system_generated: "AI generated",
  recruiter_adjust: "Recruiter revised",
  candidate_counter: "Candidate counter",
  competing_offer: "Competing offer",
};

const TRIGGER_COLORS: Record<OfferTriggerType, string> = {
  initial: "bg-blue-100 text-blue-700 border-blue-200",
  system_generated: "bg-amber-100 text-amber-700 border-amber-200",
  recruiter_adjust: "bg-indigo-100 text-indigo-700 border-indigo-200",
  candidate_counter: "bg-purple-100 text-purple-700 border-purple-200",
  competing_offer: "bg-red-100 text-red-700 border-red-200",
};

function VersionTimeline({ versions, currency }: { versions: SerializedOfferVersion[]; currency?: string | null }) {
  if (!versions.length) return null;
  return (
    <div>
      <SectionHeader>Negotiation Timeline</SectionHeader>
      <div className="space-y-3">
        {versions.map((v, i) => {
          const changes = v.changeVector?.changes ?? [];
          return (
            <div key={v.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">v{v.versionNumber}</span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", TRIGGER_COLORS[v.triggerType])}>
                    {TRIGGER_LABELS[v.triggerType]}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {v.createdBy && <span>{v.createdBy}</span>}
                  <span>{new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span>Total CTC: <strong>{fmt(v.compState.totalCtc, currency)}</strong></span>
                <span>Fixed: <strong>{fmt(v.compState.totalFixed, currency)}</strong></span>
                {v.compState.bonus != null && <span>Bonus: <strong>{fmt(v.compState.bonus, currency)}</strong></span>}
              </div>
              {changes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {changes.map((c, ci) => (
                    <span key={ci} className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium border", c.delta > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200")}>
                      {c.component}: {c.delta > 0 ? "+" : ""}{fmt(c.delta, currency)}
                    </span>
                  ))}
                </div>
              )}
              {v.justification && <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">{v.justification}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -- Decline Modal -------------------------------------------------- */

const DECLINE_REASONS = [
  { value: "comp_gap", label: "Compensation gap" },
  { value: "competing_offer", label: "Competing offer" },
  { value: "role_fit", label: "Role fit" },
  { value: "personal", label: "Personal reasons" },
  { value: "timeline", label: "Timeline" },
  { value: "other", label: "Other" },
] as const;

function DeclineModal({
  open,
  onClose,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: OfferDeclineReason) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState<OfferDeclineReason["reason"]>("comp_gap");
  const [compGapAmount, setCompGapAmount] = useState("");
  const [competingCompany, setCompetingCompany] = useState("");
  const [competingComp, setCompetingComp] = useState("");
  const [notes, setNotes] = useState("");

  if (!open) return null;

  const handleSubmit = () => {
    const data: OfferDeclineReason = { reason, notes: notes || undefined };
    if (reason === "comp_gap" && compGapAmount) data.compGapAmount = Number(compGapAmount);
    if (reason === "competing_offer") {
      if (competingCompany) data.competingCompany = competingCompany;
      if (competingComp) data.competingComp = Number(competingComp);
    }
    onConfirm(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3 className="text-sm font-semibold text-foreground mb-4">Decline reason</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {DECLINE_REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  reason === r.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {reason === "comp_gap" && (
            <Input placeholder="Gap amount (e.g. 500000)" value={compGapAmount} onChange={(e) => setCompGapAmount(e.target.value)} className="text-xs" />
          )}
          {reason === "competing_offer" && (
            <div className="space-y-2">
              <Input placeholder="Company name" value={competingCompany} onChange={(e) => setCompetingCompany(e.target.value)} className="text-xs" />
              <Input placeholder="Competing comp (optional)" value={competingComp} onChange={(e) => setCompetingComp(e.target.value)} className="text-xs" />
            </div>
          )}
          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button variant="soft" size="auto" onClick={onClose} disabled={isPending} className="text-xs px-3 py-1.5">Cancel</Button>
            <Button variant="default" size="auto" onClick={handleSubmit} disabled={isPending} className="text-xs px-3 py-1.5">
              {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Confirm decline
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -- Withdraw Modal ------------------------------------------------- */

const WITHDRAW_REASONS = [
  { value: "business_change", label: "Business change" },
  { value: "role_eliminated", label: "Role eliminated" },
  { value: "candidate_mismatch", label: "Candidate mismatch" },
  { value: "budget", label: "Budget constraints" },
  { value: "other", label: "Other" },
] as const;

function WithdrawModal({
  open,
  onClose,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: OfferWithdrawReason) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState<OfferWithdrawReason["reason"]>("business_change");
  const [notes, setNotes] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3 className="text-sm font-semibold text-foreground mb-1">Withdraw offer</h3>
        <p className="text-[11px] text-muted-foreground mb-4">This will notify the candidate that the offer has been withdrawn.</p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {WITHDRAW_REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  reason === r.value ? "border-red-400 bg-red-50 text-red-700" : "border-border text-muted-foreground hover:border-red-300",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <textarea
            placeholder="Additional notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-red-300 resize-none"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button variant="soft" size="auto" onClick={onClose} disabled={isPending} className="text-xs px-3 py-1.5">Cancel</Button>
            <Button
              variant="unstyled"
              onClick={() => onConfirm({ reason, notes: notes || undefined })}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
              Withdraw offer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -- Comp Revision Editor (Split Pane) ----------------------------- */

const CURRENCIES = ["INR", "USD", "EUR", "GBP"] as const;

function CompRevisionEditor({
  currentVersion,
  onSubmit,
  onCancel,
  isPending,
}: {
  currentVersion: SerializedOfferVersion | null;
  onSubmit: (compState: OfferCompState, justification: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const base = currentVersion?.compState;
  const [components, setComponents] = useState<CompComponent[]>(
    base?.components.map((c) => ({ ...c })) ?? [{ name: "Basic", amount: 0 }],
  );
  const [bonus, setBonus] = useState<number>(base?.bonus ?? 0);
  const [equity, setEquity] = useState<string>(base?.equity ?? "");
  const [currency, setCurrency] = useState<string>(base?.currency ?? "INR");
  const [format] = useState<OfferCompState["format"]>(base?.format ?? "indian-ctc");
  const [justification, setJustification] = useState("");
  const [newComponentName, setNewComponentName] = useState("");
  const [showAddRow, setShowAddRow] = useState(false);

  const totalFixed = components.reduce((s, c) => s + c.amount, 0);
  const totalCtc = totalFixed + bonus;

  const prevTotalFixed = base?.totalFixed ?? 0;
  const prevTotalCtc = base?.totalCtc ?? 0;

  function delta(prev: number, next: number) {
    const d = next - prev;
    if (d === 0) return null;
    return d;
  }

  function DeltaBadge({ prev, next }: { prev: number; next: number }) {
    const d = delta(prev, next);
    if (d == null) return null;
    const positive = d > 0;
    return (
      <span className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
      )}>
        {positive ? "+" : ""}{fmt(d, currency)}
      </span>
    );
  }

  const handleSubmit = () => {
    if (!justification.trim()) return;
    onSubmit(
      { components, totalFixed, totalCtc, bonus: bonus || null, equity: equity || null, currency, format },
      justification.trim(),
    );
  };

  const updateComponent = (index: number, amount: number) => {
    setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, amount } : c)));
  };

  const removeComponent = (index: number) => {
    setComponents((prev) => prev.filter((_, i) => i !== index));
  };

  const addComponent = () => {
    const name = newComponentName.trim();
    if (!name) return;
    setComponents((prev) => [...prev, { name, amount: 0 }]);
    setNewComponentName("");
    setShowAddRow(false);
  };

  return (
    <div className="rounded-2xl border border-indigo-200 bg-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-semibold text-foreground">Revise Offer</h2>
        </div>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-300"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Split pane: Current vs Revised */}
      <div className="grid grid-cols-2 gap-4">
        {/* Current (read-only) */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Current</p>
          <div className="rounded-xl border border-border bg-background overflow-hidden">
            {(base?.components ?? []).map((c) => (
              <div key={c.name} className="flex justify-between border-b border-border/60 px-3 py-2.5 last:border-b-0">
                <span className="text-[11px] text-muted-foreground">{c.name}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{fmt(c.amount, currency)}</span>
              </div>
            ))}
            {base?.bonus != null && (
              <div className="flex justify-between border-b border-border/60 px-3 py-2.5">
                <span className="text-[11px] text-muted-foreground">Bonus</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{fmt(base.bonus, currency)}</span>
              </div>
            )}
            <div className="flex justify-between bg-secondary/50 px-3 py-2.5 border-t border-border">
              <span className="text-[11px] font-semibold text-muted-foreground">Total Fixed</span>
              <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{fmt(prevTotalFixed, currency)}</span>
            </div>
            <div className="flex justify-between bg-secondary/50 px-3 py-2">
              <span className="text-[11px] font-semibold text-muted-foreground">Total CTC</span>
              <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{fmt(prevTotalCtc, currency)}</span>
            </div>
          </div>
        </div>

        {/* Revised (editable) */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">Revised</p>
            {delta(prevTotalCtc, totalCtc) != null && (
              <DeltaBadge prev={prevTotalCtc} next={totalCtc} />
            )}
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/10 overflow-hidden">
            {components.map((c, i) => {
              const prevAmount = base?.components.find((bc) => bc.name === c.name)?.amount ?? 0;
              return (
                <div key={c.name} className="flex items-center gap-2 border-b border-indigo-100 px-3 py-1.5 last:border-b-0">
                  <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">{c.name}</span>
                  <DeltaBadge prev={prevAmount} next={c.amount} />
                  <input
                    type="number"
                    value={c.amount || ""}
                    onChange={(e) => updateComponent(i, Number(e.target.value) || 0)}
                    className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] tabular-nums text-right font-medium focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    placeholder="0"
                  />
                  {components.length > 1 && (
                    <button onClick={() => removeComponent(i)} className="text-muted-foreground hover:text-red-500 transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Bonus */}
            <div className="flex items-center gap-2 border-b border-indigo-100 px-3 py-1.5">
              <span className="text-[11px] text-muted-foreground flex-1">Bonus</span>
              <DeltaBadge prev={base?.bonus ?? 0} next={bonus} />
              <input
                type="number"
                value={bonus || ""}
                onChange={(e) => setBonus(Number(e.target.value) || 0)}
                className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] tabular-nums text-right font-medium focus:outline-none focus:ring-1 focus:ring-indigo-300"
                placeholder="0"
              />
              <div className="w-3" />
            </div>

            {/* Totals */}
            <div className="flex items-center justify-between bg-indigo-100/30 px-3 py-2.5 border-t border-indigo-200">
              <span className="text-[11px] font-semibold">Total Fixed</span>
              <div className="flex items-center gap-2">
                <DeltaBadge prev={prevTotalFixed} next={totalFixed} />
                <span className="text-[11px] font-bold tabular-nums">{fmt(totalFixed, currency)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between bg-indigo-100/30 px-3 py-2">
              <span className="text-[11px] font-semibold">Total CTC</span>
              <div className="flex items-center gap-2">
                <DeltaBadge prev={prevTotalCtc} next={totalCtc} />
                <span className="text-[11px] font-bold tabular-nums text-indigo-700">{fmt(totalCtc, currency)}</span>
              </div>
            </div>
          </div>

          {/* Add component */}
          {showAddRow ? (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={newComponentName}
                onChange={(e) => setNewComponentName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addComponent()}
                placeholder="Component name"
                className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-300"
                autoFocus
              />
              <button onClick={addComponent} className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700">Add</button>
              <button onClick={() => { setShowAddRow(false); setNewComponentName(""); }} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddRow(true)}
              className="mt-2 flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <Plus className="h-3 w-3" /> Add component
            </button>
          )}
        </div>
      </div>

      {/* Equity */}
      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Equity / ESOP</label>
        <input
          type="text"
          value={equity}
          onChange={(e) => setEquity(e.target.value)}
          placeholder="e.g. 500 ESOPs vesting over 4 years"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
      </div>

      {/* Justification */}
      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
          Why are you revising this offer? <span className="text-red-500">*</span>
        </label>
        <textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="e.g. Candidate countered with competing offer from X..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
          rows={2}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="soft" size="auto" onClick={onCancel} disabled={isPending} className="text-xs px-3 py-1.5">
          Cancel
        </Button>
        <Button
          variant="default"
          size="auto"
          onClick={handleSubmit}
          disabled={isPending || !justification.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Revise & Send
        </Button>
      </div>
    </div>
  );
}

/* -- Main Component ------------------------------------------------ */

export default function OfferDetailClient({ offer }: { offer: SerializedOfferDetail }) {
  useEntityEvent(["offer"]);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [showRevisionEditor, setShowRevisionEditor] = useState(false);
  const [revisionPending, setRevisionPending] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  const [offerLetterLoading, setOfferLetterLoading] = useState(false);
  const [payStubsLoading, setPayStubsLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);

  const [localExtracted, setLocalExtracted] = useState<ExtractedOfferLetter | null>(offer.extractedOfferLetter);
  const [localPayStubs, setLocalPayStubs] = useState<ExtractedPayStub[] | null>(offer.extractedPayStubs);
  const [localGenerated, setLocalGenerated] = useState<GeneratedOffer | null>(offer.generatedOffer);

  const handleUploadOfferLetter = async (files: FileList) => {
    const file = files[0];
    if (!file) return;
    setOfferLetterLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadOfferLetter(offer.id, formData);
      if (result.data) {
        setLocalExtracted(result.data);
        router.refresh();
      }
    } finally {
      setOfferLetterLoading(false);
    }
  };

  const handleUploadPayStubs = async (files: FileList) => {
    if (!files.length) return;
    setPayStubsLoading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("files", f));
      const result = await uploadPayStubs(offer.id, formData);
      if (result.data) {
        setLocalPayStubs(result.data);
        router.refresh();
      }
    } finally {
      setPayStubsLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerateLoading(true);
    try {
      await generateOfferManual(offer.id);
      router.refresh();
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleReviseOffer = async (compState: OfferCompState, justification: string) => {
    setRevisionPending(true);
    try {
      const result = await reviseOffer(offer.id, { compState, justification });
      if (result.error) {
        console.error("[handleReviseOffer]", result.error);
      } else {
        setShowRevisionEditor(false);
        router.refresh();
      }
    } finally {
      setRevisionPending(false);
    }
  };

  const handleWithdrawConfirm = (reason: OfferWithdrawReason) => {
    setPendingAction("withdrawn");
    startTransition(async () => {
      try {
        const result = await withdrawOffer(offer.id, reason);
        if (result.error) {
          console.error("[handleWithdraw]", result.error);
        } else {
          setShowWithdrawModal(false);
          router.refresh();
        }
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleStatusChange = (newStatus: "sent" | "accepted" | "declined") => {
    if (newStatus === "declined") {
      setShowDeclineModal(true);
      return;
    }
    setPendingAction(newStatus);
    startTransition(async () => {
      try {
        if (newStatus === "sent") {
          await sendOffer(offer.id);
        } else {
          const updates: Record<string, unknown> = { status: newStatus };
          if (newStatus === "accepted") updates.acceptedAt = new Date().toISOString();
          await editOffer(offer.id, updates);
        }
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleDeclineConfirm = (reason: OfferDeclineReason) => {
    setPendingAction("declined");
    startTransition(async () => {
      try {
        await editOffer(offer.id, {
          declineReason: reason,
          status: "declined",
          declinedAt: new Date().toISOString(),
        });
        setShowDeclineModal(false);
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  };

  const isSent = offer.status === "sent";
  const isNegotiating = offer.status === "negotiating";
  const isClosed = offer.status === "accepted" || offer.status === "declined" || offer.status === "withdrawn";

  // Use server data if local state hasn't been set yet (e.g. from SSE refresh)
  const extracted = localExtracted ?? offer.extractedOfferLetter;
  const payStubs = localPayStubs ?? offer.extractedPayStubs;
  const generated = localGenerated ?? offer.generatedOffer;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <Link href="/recruit/offers" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4">
              <ArrowLeft className="h-3 w-3" />
              Back to offers
            </Link>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-foreground">{offer.candidateName || "Unknown candidate"}</h1>
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize", statusColor(offer.status))}>{offer.status}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {offer.roleTitle || "Unknown role"}
                  {offer.candidateTitle ? ` \u00B7 Currently ${offer.candidateTitle}` : ""}
                  {offer.candidateLocation ? ` \u00B7 ${offer.candidateLocation}` : ""}
                </p>
              </div>
              {!isClosed && (
                <div className="flex items-center gap-2 shrink-0">
                  {isSent || isNegotiating ? (
                    <>
                      <Button
                        variant="unstyled"
                        onClick={() => setShowRevisionEditor(true)}
                        disabled={isPending || showRevisionEditor}
                        className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                      >
                        <Pencil size={12} className="shrink-0" />
                        Revise
                      </Button>
                      <Button
                        variant="unstyled"
                        onClick={() => handleStatusChange("accepted")}
                        disabled={isPending}
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                      >
                        {pendingAction === "accepted" ? <Loader2 size={12} className="shrink-0 animate-spin" /> : <ThumbsUp size={12} className="shrink-0" />}
                        Accepted
                      </Button>
                      <Button
                        variant="unstyled"
                        onClick={() => handleStatusChange("declined")}
                        disabled={isPending}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        {pendingAction === "declined" ? <Loader2 size={12} className="shrink-0 animate-spin" /> : <ThumbsDown size={12} className="shrink-0" />}
                        Declined
                      </Button>
                      <Button
                        variant="unstyled"
                        onClick={() => setShowWithdrawModal(true)}
                        disabled={isPending}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        {pendingAction === "withdrawn" ? <Loader2 size={12} className="shrink-0 animate-spin" /> : <Ban size={12} className="shrink-0" />}
                        Withdraw
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
                      Approve & send offer
                    </Button>
                  )}
                </div>
              )}
              {offer.status === "declined" && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="unstyled"
                    onClick={() => handleStatusChange("sent")}
                    disabled={isPending}
                    className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
                  >
                    {pendingAction === "sent" ? <Loader2  size={15} className="shrink-0 animate-spin" /> : <RefreshCw size={15} className="shrink-0" />}
                    Reopen offer
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Upload Section */}
          {!isClosed && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Compensation Documents</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <UploadZone
                  label="Past Offer Letter"
                  hint="PDF of the candidate's current/last offer letter"
                  isUploaded={!!extracted}
                  fileName={extracted?.sourceFileName}
                  onUpload={handleUploadOfferLetter}
                  isLoading={offerLetterLoading}
                />
                <UploadZone
                  label="Pay Stubs (optional)"
                  hint="Recent pay stubs to verify compensation"
                  multiple
                  isUploaded={!!payStubs?.length}
                  fileName={payStubs?.length ? `${payStubs.length} stub(s) uploaded` : null}
                  onUpload={handleUploadPayStubs}
                  isLoading={payStubsLoading}
                />
              </div>
            </div>
          )}

          {/* Extracted Data */}
          {extracted && (
            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-foreground">Extracted Compensation</h2>
                {extracted.bandLevel && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {extracted.bandLevel}
                  </span>
                )}
                {extracted.designation && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {extracted.designation}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <CompTable components={extracted.components} currency={extracted.currency} label="Salary Components" />

                {payStubs && payStubs.length > 0 && (
                  <div>
                    <SectionHeader>Pay Stub Summary</SectionHeader>
                    <div className="rounded-xl border border-border bg-background overflow-hidden">
                      <div className="grid grid-cols-4 gap-2 border-b border-border bg-secondary/50 px-4 py-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Month</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right">Gross</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right">Deductions</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right">Net</span>
                      </div>
                      {payStubs.map((s, i) => (
                        <div key={i} className="grid grid-cols-4 gap-2 border-b border-border/60 px-4 py-2.5 last:border-b-0">
                          <span className="text-xs text-muted-foreground">{s.month ?? `Stub ${i + 1}`}</span>
                          <span className="text-xs tabular-nums text-right">{fmt(s.grossEarnings, s.currency)}</span>
                          <span className="text-xs tabular-nums text-right text-red-600">{fmt(s.totalDeductions, s.currency)}</span>
                          <span className="text-xs tabular-nums text-right font-medium">{fmt(s.netPay, s.currency)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-4 py-3">
                <div className="flex items-center gap-6 text-xs">
                  <span>Fixed CTC: <strong>{fmt(extracted.fixedCtc, extracted.currency)}</strong></span>
                  {extracted.variableBonus != null && <span>Variable: <strong>{fmt(extracted.variableBonus, extracted.currency)}</strong></span>}
                  <span>Total CTC: <strong className="text-foreground">{fmt(extracted.totalCtc, extracted.currency)}</strong></span>
                </div>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground capitalize">
                  {extracted.format.replace("-", " ")}
                </span>
              </div>
            </div>
          )}

          {/* Generated Offer */}
          {generated && extracted && (
            <div className="rounded-2xl border border-emerald-200 bg-card p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <h2 className="text-sm font-semibold text-foreground">Generated Offer Recommendation</h2>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                    +{generated.hike.percentage.toFixed(1)}% hike
                  </span>
                </div>
                <Button
                  variant="soft"
                  onClick={handleGenerate}
                  disabled={generateLoading}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {generateLoading ? <Loader2 size={15} className="shrink-0 animate-spin" /> : <RefreshCw size={15} className="shrink-0" />}
                  Regenerate
                </Button>
              </div>

              {/* Guardrail Warnings */}
              {(generated.guardrailWarnings?.length || generated.bandCompliance !== "within") && (
                <div className="space-y-2">
                  {generated.bandCompliance === "out-of-band" && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/50 p-3">
                      <ShieldAlert className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-red-700">Out of band</p>
                        <p className="text-[11px] text-red-600">This offer exceeds the approved compensation band. Approval may be required.</p>
                      </div>
                    </div>
                  )}
                  {generated.bandCompliance === "stretched" && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-amber-700">Stretched band</p>
                        <p className="text-[11px] text-amber-600">This offer is near the edge of the compensation band.</p>
                      </div>
                    </div>
                  )}
                  {generated.parityRisk === "high" && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/50 p-3">
                      <ShieldAlert className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-red-600">High parity risk — this offer may create internal equity issues.</p>
                    </div>
                  )}
                  {generated.guardrailWarnings?.map((w, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/30 px-3 py-2">
                      <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                      <p className="text-[11px] text-amber-700">{w}</p>
                    </div>
                  ))}
                </div>
              )}

              <ComparisonView current={extracted} proposed={generated} />
              <NegotiationBar generated={generated} roleBand={offer.roleCompensation} />

              {generated.rationale && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/30 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[8px]">&#10022;</div>
                    <span className="text-xs font-semibold text-amber-900">Rationale</span>
                  </div>
                  <p className="text-xs leading-relaxed text-foreground">{generated.rationale}</p>
                </div>
              )}
            </div>
          )}

          {/* Generate button when extracted but not yet generated */}
          {extracted && !generated && !generateLoading && (
            <div className="flex justify-center">
              <Button
                variant="default"
                onClick={handleGenerate}
                className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                <Sparkles className="h-4 w-4" />
                Generate Offer Recommendation
              </Button>
            </div>
          )}
          {generateLoading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Generating offer recommendation...</p>
            </div>
          )}

          {/* Leverage Assessment */}
          {offer.leverage && (
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Leverage Assessment</h2>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize",
                    offer.leverage.strategy === "premium_required" ? "border-red-200 bg-red-50 text-red-700"
                      : offer.leverage.strategy === "market_rate" ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700",
                  )}>
                    {offer.leverage.strategy.replace(/_/g, " ")}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex flex-col items-center">
                  <span className={cn(
                    "text-2xl font-bold tabular-nums",
                    offer.leverage.score >= 70 ? "text-red-600" : offer.leverage.score >= 40 ? "text-amber-600" : "text-emerald-600",
                  )}>
                    {offer.leverage.score}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">leverage</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className={cn(
                    "text-2xl font-bold tabular-nums",
                    offer.leverage.closeProbability >= 70 ? "text-emerald-600" : offer.leverage.closeProbability >= 40 ? "text-amber-600" : "text-red-600",
                  )}>
                    {offer.leverage.closeProbability}%
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">close prob.</span>
                </div>
              </div>

              {offer.leverage.factors.length > 0 && (
                <div className="space-y-1.5">
                  {offer.leverage.factors.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className={cn(
                        "mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
                        f.impact === "increases" ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600",
                      )}>
                        {f.impact === "increases" ? "+" : "-"}
                      </span>
                      <div>
                        <span className="font-medium text-foreground">{f.factor}</span>
                        <span className="text-muted-foreground"> — {f.signal}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Comp Revision Editor */}
          {showRevisionEditor && (
            <CompRevisionEditor
              currentVersion={offer.currentVersion}
              onSubmit={handleReviseOffer}
              onCancel={() => setShowRevisionEditor(false)}
              isPending={revisionPending}
            />
          )}

          {/* Version Timeline */}
          {offer.versions.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <VersionTimeline
                versions={offer.versions}
                currency={offer.currentVersion?.compState.currency ?? offer.extractedOfferLetter?.currency}
              />
            </div>
          )}

          {/* Close Analysis (existing) */}
          {(offer.closeRisks?.length || offer.checklist?.length || offer.recommendation) && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">Close Analysis</h2>
              </div>
              <div className="grid gap-0 lg:grid-cols-2">
                <div className="border-b border-border lg:border-b-0 lg:border-r px-6 py-5 space-y-5">
                  {offer.closeRisks && offer.closeRisks.length > 0 && (
                    <div>
                      <SectionHeader>Risks</SectionHeader>
                      <div className="rounded-xl border border-border bg-background p-4">
                        {offer.closeRisks.map((r, index) => (
                          <div key={`${r.label}-${index}`} className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-b-0">
                            <span className="text-xs text-muted-foreground">{r.label}</span>
                            <span className="text-xs font-medium text-right">{r.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {offer.recommendation && (
                    <div className="rounded-xl border border-amber-100 bg-amber-50/30 p-4">
                      <p className="text-xs leading-relaxed text-foreground">{offer.recommendation}</p>
                    </div>
                  )}
                </div>
                <div className="px-6 py-5 space-y-5">
                  {offer.checklist && offer.checklist.length > 0 && (
                    <div>
                      <SectionHeader>Checklist</SectionHeader>
                      <div className="space-y-2">
                        {offer.checklist.map((item, index) => (
                          <div key={`${item.label}-${index}`} className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5">
                            {item.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <Flag className="h-4 w-4 shrink-0 text-amber-500" />}
                            <span className={cn("text-xs", item.done ? "text-muted-foreground" : "text-foreground font-medium")}>{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {offer.closeOwnership && offer.closeOwnership.length > 0 && (
                    <div>
                      <SectionHeader>Ownership</SectionHeader>
                      <div className="space-y-2">
                        {offer.closeOwnership.map((item, index) => (
                          <div key={`${item.owner}-${index}`} className="rounded-lg border border-border bg-background px-4 py-2.5">
                            <p className="text-xs"><span className="font-semibold">{item.owner}:</span> <span className="text-muted-foreground">{item.task}</span></p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Decline Reason (if declined) */}
          {isClosed && offer.declineReason && (
            <div className="rounded-2xl border border-red-200 bg-red-50/30 p-6">
              <div className="flex items-center gap-2 mb-3">
                <ThumbsDown className="h-4 w-4 text-red-500" />
                <h2 className="text-sm font-semibold text-foreground">Decline Reason</h2>
                <span className="rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 capitalize">
                  {offer.declineReason.reason.replace("_", " ")}
                </span>
              </div>
              <div className="space-y-1 text-xs">
                {offer.declineReason.compGapAmount != null && (
                  <p className="text-muted-foreground">Gap: <strong className="text-foreground">{fmt(offer.declineReason.compGapAmount, offer.declineReason.compGapCurrency)}</strong></p>
                )}
                {offer.declineReason.competingCompany && (
                  <p className="text-muted-foreground">Lost to: <strong className="text-foreground">{offer.declineReason.competingCompany}</strong></p>
                )}
                {offer.declineReason.competingComp != null && (
                  <p className="text-muted-foreground">Competing comp: <strong className="text-foreground">{fmt(offer.declineReason.competingComp)}</strong></p>
                )}
                {offer.declineReason.notes && (
                  <p className="text-muted-foreground mt-2">{offer.declineReason.notes}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <DeclineModal
        open={showDeclineModal}
        onClose={() => setShowDeclineModal(false)}
        onConfirm={handleDeclineConfirm}
        isPending={pendingAction === "declined"}
      />
      <WithdrawModal
        open={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        onConfirm={handleWithdrawConfirm}
        isPending={pendingAction === "withdrawn"}
      />
    </div>
  );
}
