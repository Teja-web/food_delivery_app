"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, ChevronRight, Columns, FileText, MapPin } from "lucide-react";
import { EyebrowHeading } from "@/components/portal/eyebrow-heading";
import { Button } from "@/components/ui/button";

interface Offer {
  offerId: string;
  applicationId: string;
  status: string;
  validUntil: Date | null;
  sentAt: Date | null;
  compBase: string | null;
  compEquity: string | null;
  compBonus: string | null;
  compensation: unknown;
  startDate: Date | null;
  jobId: string;
  jobTitle: string | null;
  jobLocation: string | null;
  jobEmploymentType: string | null;
  orgName: string | null;
  orgWebsite: string | null;
}

export function OffersClient({
  offers,
  closed,
}: {
  offers: Offer[];
  closed: Offer[];
}) {
  const [mode, setMode] = useState<"list" | "compare">(offers.length >= 2 ? "compare" : "list");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <EyebrowHeading accent="amber">Offers</EyebrowHeading>
          <h1 className="mt-1 font-display text-3xl font-bold text-foreground">
            {offers.length} open offer{offers.length === 1 ? "" : "s"}
          </h1>
        </div>
        {offers.length >= 2 && (
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            <ModeButton
              active={mode === "list"}
              onClick={() => setMode("list")}
              icon={FileText}
              label="List"
            />
            <ModeButton
              active={mode === "compare"}
              onClick={() => setMode("compare")}
              icon={Columns}
              label="Compare"
            />
          </div>
        )}
      </div>

      {mode === "list" ? (
        <div className="space-y-3">
          {offers.map((o) => (
            <OfferRow key={o.offerId} offer={o} />
          ))}
        </div>
      ) : (
        <CompareView offers={offers} />
      )}

      {closed.length > 0 && (
        <details className="mt-10 rounded-2xl border border-dashed border-stone-200 p-5">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            {closed.length} closed / past offer{closed.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-3 space-y-2">
            {closed.map((o) => (
              <OfferRow key={o.offerId} offer={o} muted />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-amber-500/15 text-amber-700"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function OfferRow({ offer, muted }: { offer: Offer; muted?: boolean }) {
  const expires = formatExpiry(offer.validUntil);
  return (
    <Link
      href={`/roles/${offer.jobId}/offer`}
      className={`flex items-center justify-between gap-4 rounded-2xl border p-4 transition-colors ${
        muted
          ? "border-border opacity-70 hover:opacity-100"
          : "border-border bg-card hover:border-amber-200 hover:bg-amber-50/10"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">
          {offer.orgName ?? "—"}
        </p>
        <p className="mt-1 font-display text-base font-semibold text-foreground">
          {offer.jobTitle ?? "Open offer"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {offer.jobLocation && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {offer.jobLocation}
            </span>
          )}
          {offer.compBase && (
            <span className="font-medium text-foreground">{offer.compBase}</span>
          )}
          {expires && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {expires}
            </span>
          )}
          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
            {offer.status}
          </span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function CompareView({ offers }: { offers: Offer[] }) {
  const rows: Array<{ label: string; key: keyof Offer | "comp" | "expires" }> = [
    { label: "Company", key: "orgName" },
    { label: "Role", key: "jobTitle" },
    { label: "Status", key: "status" },
    { label: "Location", key: "jobLocation" },
    { label: "Base", key: "compBase" },
    { label: "Equity", key: "compEquity" },
    { label: "Bonus", key: "compBonus" },
    { label: "Start date", key: "startDate" },
    { label: "Expires", key: "expires" },
  ];

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="w-32 p-4 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Field
            </th>
            {offers.map((o, i) => (
              <th key={o.offerId} className="p-4 text-left">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">
                  Offer {i + 1}
                </p>
                <p className="mt-1 font-display text-sm font-semibold text-foreground">
                  {o.orgName ?? "—"}
                </p>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-0">
              <td className="bg-stone-50/40 p-4 text-xs font-semibold text-muted-foreground">
                {row.label}
              </td>
              {offers.map((o) => (
                <td key={o.offerId} className="p-4 text-sm text-foreground">
                  {renderCell(o, row.key)}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className="bg-stone-50/40 p-4 text-xs font-semibold text-muted-foreground">
              Action
            </td>
            {offers.map((o) => (
              <td key={o.offerId} className="p-4">
                <Link
                  href={`/roles/${o.jobId}/offer`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline"
                >
                  Review <ArrowRight className="h-3 w-3" />
                </Link>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function renderCell(offer: Offer, key: keyof Offer | "comp" | "expires"): string {
  if (key === "expires") return formatExpiry(offer.validUntil) ?? "—";
  const v = (offer as unknown as Record<string, unknown>)[key as string];
  if (v == null) return "—";
  if (v instanceof Date) return v.toLocaleDateString();
  return String(v);
}

function formatExpiry(d: Date | null): string | null {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  if (ms < 0) return "expired";
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 1) return "expires today";
  if (days <= 7) return `expires in ${days} days`;
  return `expires ${new Date(d).toLocaleDateString()}`;
}
