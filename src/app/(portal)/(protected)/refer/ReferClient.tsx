"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Send, Share2, X } from "lucide-react";
import {
  createReferralAction,
  revokeReferralAction,
} from "@/actions/referrals";
import type { Referral } from "@/db/schema";
import { EmptyState } from "@/components/empty-state";
import { EyebrowHeading } from "@/components/portal/eyebrow-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface RefRole {
  jobId: string;
  jobTitle: string;
  orgName: string | null;
}

export function ReferClient({
  refRoles,
  initialReferrals,
}: {
  refRoles: RefRole[];
  initialReferrals: Referral[];
}) {
  const [referrals, setReferrals] = useState(initialReferrals);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function buildLink(referral: Referral): string {
    if (typeof window === "undefined") return "";
    // /r/[token] resolves server-side to /opportunities/[slug]?ref=token
    // (or directly to claim for private roles). Short URL is friendlier
    // for sharing.
    return `${window.location.origin}/r/${referral.signedToken}`;
  }

  function copy(referral: Referral) {
    void navigator.clipboard.writeText(buildLink(referral));
    setCopiedId(referral.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function create(formData: FormData) {
    setError(null);
    const roleId = formData.get("roleId") as string;
    if (!roleId) {
      setError("Pick a role to refer.");
      return;
    }
    const message = (formData.get("message") as string) || null;
    const singleUse = formData.get("singleUse") === "on";
    const ttlDays = Number(formData.get("ttlDays") ?? "30");
    startTransition(async () => {
      try {
        const result = await createReferralAction({
          roleId,
          message,
          singleUse,
          ttlDays,
        });
        if (!result.ok) {
          setError(
            result.reason === "forbidden"
              ? "You can only refer roles you've applied to or that are public."
              : result.reason === "rate_limited"
                ? "You've issued too many referrals recently — try again later."
                : "Role not found.",
          );
          return;
        }
        setReferrals((prev) => [result.referral, ...prev]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create referral");
      }
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      try {
        await revokeReferralAction(id);
        setReferrals((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: "revoked" } : r)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to revoke");
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-1 flex items-center gap-2">
        <Share2 className="h-4 w-4 text-amber-600" />
        <EyebrowHeading accent="amber">Refer</EyebrowHeading>
      </div>
      <h1 className="mt-1 font-display text-3xl font-bold text-foreground">
        Refer a role to a friend
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Share a role with someone you think would be a great fit. They'll see
        a "{`{your name}`} thought you'd be a fit" banner on the listing, and
        the role's full details unlock for them on the public page.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/40 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {refRoles.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Share2}
            headline="Apply to a role first"
            description="You can refer roles from your applications. Browse open roles and apply to a few — they'll show up here for sharing."
            cta={{ label: "Browse roles", href: "/roles" }}
          />
        </div>
      ) : (
        <form
          action={create}
          className="mt-6 rounded-2xl border border-border bg-card p-5"
        >
          <div className="space-y-4">
            <Field label="Role" required>
              <select
                name="roleId"
                defaultValue=""
                required
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
              >
                <option value="">— Select a role —</option>
                {refRoles.map((r) => (
                  <option key={r.jobId} value={r.jobId}>
                    {r.jobTitle}
                    {r.orgName ? ` · ${r.orgName}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Personal message" hint="Optional · shown on the landing page">
              <Textarea
                name="message"
                rows={3}
                placeholder="Hey — I think you'd crush this role. The team is..."
                maxLength={400}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Expires (days)">
                <Input name="ttlDays" type="number" defaultValue="30" min={1} max={365} />
              </Field>
              <Field label="Single-use">
                <label className="mt-2 inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name="singleUse" className="h-4 w-4" />
                  <span className="text-foreground">Only one person can use this link</span>
                </label>
              </Field>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end">
            <Button type="submit" disabled={pending} className="gap-1.5">
              <Send className="h-3.5 w-3.5" />
              {pending ? "Creating..." : "Create referral link"}
            </Button>
          </div>
        </form>
      )}

      <section className="mt-10">
        <EyebrowHeading className="mb-3">Your referrals</EyebrowHeading>
        {referrals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No referrals yet. Pick a role above to create your first link.
          </p>
        ) : (
          <div className="space-y-2">
            {referrals.map((r) => (
              <ReferralRow
                key={r.id}
                referral={r}
                link={buildLink(r)}
                copied={copiedId === r.id}
                onCopy={() => copy(r)}
                onRevoke={() => revoke(r.id)}
                pending={pending}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ReferralRow({
  referral,
  link,
  copied,
  onCopy,
  onRevoke,
  pending,
}: {
  referral: Referral;
  link: string;
  copied: boolean;
  onCopy: () => void;
  onRevoke: () => void;
  pending: boolean;
}) {
  const isExpired = referral.expiresAt.getTime() < Date.now();
  const isRevoked = referral.status === "revoked";
  const isUsed = referral.status === "used" || referral.claimedByCandidateId;

  const status = isRevoked
    ? "revoked"
    : isExpired
      ? "expired"
      : isUsed
        ? "used"
        : "active";

  const statusColor =
    status === "active"
      ? "text-emerald-600 bg-emerald-50/60 border-emerald-200"
      : status === "used"
        ? "text-blue-600 bg-blue-50/60 border-blue-200"
        : "text-stone-600 bg-stone-50/60 border-stone-200";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {referral.message ? `"${referral.message.slice(0, 60)}${referral.message.length > 60 ? "…" : ""}"` : "(no message)"}
            </p>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusColor}`}
            >
              {status}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {referral.singleUse ? "Single-use" : "Shareable"} · expires{" "}
            {referral.expiresAt.toLocaleDateString()}
          </p>
          {status === "active" && (
            <code className="mt-2 block truncate rounded-md bg-stone-50 px-2 py-1 text-[11px] text-stone-600">
              {link}
            </code>
          )}
        </div>
        {status === "active" && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onCopy}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Copy link"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRevoke}
              disabled={pending}
              className="text-muted-foreground hover:text-rose-600"
              aria-label="Revoke"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-foreground">
        {label}
        {required && <span className="text-rose-500">*</span>}
        {hint && (
          <span className="ml-1 font-normal text-muted-foreground">· {hint}</span>
        )}
      </label>
      {children}
    </div>
  );
}
