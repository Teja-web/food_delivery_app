"use client";

import { useState, useTransition } from "react";
import { Check, Copy, GraduationCap, Plus, X } from "lucide-react";
import {
  createCampusInviteAction,
  revokeCampusInviteAction,
} from "@/actions/campus";
import type { CampusInvite } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const APP_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL ?? "";

export function CampusInvitesClient({
  initialInvites,
}: {
  initialInvites: CampusInvite[];
}) {
  const [invites, setInvites] = useState(initialInvites);
  const [showForm, setShowForm] = useState(invites.length === 0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function buildLink(token: string): string {
    return `${APP_URL || ""}/campus/claim?token=${token}`;
  }

  function copy(token: string, id: string) {
    void navigator.clipboard.writeText(buildLink(token));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function create(formData: FormData) {
    setError(null);
    const cohortLabel = (formData.get("cohortLabel") as string) || null;
    const institutionName = (formData.get("institutionName") as string) || null;
    const email = (formData.get("email") as string)?.trim() || null;
    const singleUse = formData.get("mode") === "single";
    const maxUses = formData.get("maxUses")
      ? Number(formData.get("maxUses"))
      : null;
    const ttlDays = Number(formData.get("ttlDays") ?? "30");
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);

    startTransition(async () => {
      try {
        const created = await createCampusInviteAction({
          cohortLabel,
          institutionName,
          email,
          singleUse,
          maxUses: singleUse ? null : maxUses,
          expiresAt,
        });
        setInvites((prev) => [created, ...prev]);
        setShowForm(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create invite");
      }
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      try {
        await revokeCampusInviteAction(id);
        setInvites((prev) =>
          prev.map((inv) => (inv.id === id ? { ...inv, status: "revoked" } : inv)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to revoke invite");
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-amber-600" />
            <h1 className="font-display text-2xl font-bold text-foreground">
              Campus invites
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Invite students to join your pool. Each link sets the candidate's
            kind to <em>student</em> and adds them to your university's pool.
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New invite
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50/40 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {showForm && (
        <form
          action={create}
          className="mb-6 rounded-2xl border border-border bg-card p-5"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Cohort label" hint="e.g. CS 2027 — display only">
              <Input name="cohortLabel" placeholder="CS 2027" />
            </Field>
            <Field label="Institution name" hint="Pre-fills student profile">
              <Input name="institutionName" placeholder="MIT" />
            </Field>
            <Field
              label="Mode"
              hint="Cohort link is shareable; per-student is one-time"
            >
              <select
                name="mode"
                defaultValue="cohort"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
              >
                <option value="cohort">Cohort link (anyone with URL)</option>
                <option value="single">Per-student (single use)</option>
              </select>
            </Field>
            <Field label="Email" hint="Required for per-student; ignored for cohort">
              <Input name="email" type="email" placeholder="student@uni.edu" />
            </Field>
            <Field label="Max uses" hint="Cohort only — leave blank for unlimited">
              <Input name="maxUses" type="number" min={1} placeholder="50" />
            </Field>
            <Field label="Expires (days)">
              <Input name="ttlDays" type="number" defaultValue="30" min={1} />
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <Button type="submit" disabled={pending} className="gap-1.5">
              {pending ? "Creating..." : "Create invite"}
            </Button>
          </div>
        </form>
      )}

      {invites.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 p-10 text-center">
          <GraduationCap className="mx-auto h-7 w-7 text-muted-foreground/60" />
          <p className="mt-2 text-sm font-semibold text-foreground">
            No campus invites yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Issue an invite link and share it with your students.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {invites.map((inv) => (
            <InviteRow
              key={inv.id}
              invite={inv}
              link={buildLink(inv.signedToken)}
              copied={copiedId === inv.id}
              onCopy={() => copy(inv.signedToken, inv.id)}
              onRevoke={() => revoke(inv.id)}
              pending={pending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InviteRow({
  invite,
  link,
  copied,
  onCopy,
  onRevoke,
  pending,
}: {
  invite: CampusInvite;
  link: string;
  copied: boolean;
  onCopy: () => void;
  onRevoke: () => void;
  pending: boolean;
}) {
  const isExpired = invite.expiresAt.getTime() < Date.now();
  const isRevoked = invite.status === "revoked";
  const isExhausted =
    !invite.singleUse &&
    invite.maxUses != null &&
    invite.useCount >= invite.maxUses;
  const isUsed = invite.singleUse && invite.usedByCandidateId;

  const status = isRevoked
    ? "revoked"
    : isExpired
      ? "expired"
      : isExhausted
        ? "exhausted"
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
            <p className="text-sm font-semibold text-foreground">
              {invite.cohortLabel ?? invite.email ?? "Unlabeled invite"}
            </p>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusColor}`}
            >
              {status}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {invite.institutionName && <>📚 {invite.institutionName} · </>}
            {invite.singleUse
              ? "Single-use"
              : `Cohort · ${invite.useCount}${invite.maxUses ? `/${invite.maxUses}` : ""} used`}
            {" · expires "}
            {invite.expiresAt.toLocaleDateString()}
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
              aria-label="Revoke invite"
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
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-foreground">
        {label}
        {hint && <span className="ml-1 font-normal text-muted-foreground">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}
