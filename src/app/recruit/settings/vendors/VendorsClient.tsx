"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelVendorInvitationAction,
  inviteVendorAction,
  pauseVendorPartnershipAction,
  resendVendorInvitationAction,
  resumeVendorPartnershipAction,
  revokeVendorPartnershipAction,
} from "@/actions/vendor-partnerships";

type Partnership = {
  id: string;
  vendorOrgId: string;
  vendorOrgName: string | null;
  status: "active" | "paused";
  createdAt: Date;
  createdByName: string | null;
};

type Invitation = {
  id: string;
  email: string;
  proposedVendorOrgName: string;
  status: "pending" | "accepted" | "cancelled" | "expired";
  expiresAt: Date;
  createdAt: Date;
  createdByName: string | null;
};

export function VendorsClient({
  partnerships,
  invitations,
}: {
  partnerships: Partnership[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastAcceptUrl, setLastAcceptUrl] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLastAcceptUrl(null);
    if (!email.trim() || !orgName.trim()) {
      setError("Email and vendor org name are required.");
      return;
    }
    startTransition(async () => {
      try {
        const { acceptUrl } = await inviteVendorAction({
          email: email.trim(),
          proposedVendorOrgName: orgName.trim(),
        });
        setLastAcceptUrl(acceptUrl);
        setEmail("");
        setOrgName("");
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to invite vendor");
      }
    });
  }

  function withConfirm(fn: () => Promise<unknown>, message: string) {
    return () => {
      if (!confirm(message)) return;
      startTransition(async () => {
        try {
          await fn();
          refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Action failed");
        }
      });
    };
  }

  return (
    <div className="space-y-8 p-6">
      <header>
        <h1 className="text-xl font-semibold">Vendors</h1>
        <p className="text-sm text-muted-foreground">
          Invite staffing partners and manage which roles each vendor can see. Vendors can supply
          candidates and schedule interviews; offers stay internal.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Invite a vendor</h2>
        <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Vendor admin email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              placeholder="admin@vendor.com"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Vendor org name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              placeholder="Vendor Co."
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send invite"}
          </button>
        </form>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {lastAcceptUrl && (
          <p className="text-xs text-muted-foreground">
            Accept link (also emailed):{" "}
            <code className="break-all rounded bg-muted px-1.5 py-0.5">{lastAcceptUrl}</code>
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Pending invitations</h2>
        {invitations.length === 0 ? (
          <p className="text-xs text-muted-foreground">None.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2">Email</th>
                <th className="py-2">Proposed name</th>
                <th className="py-2">Expires</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id} className="border-t border-border">
                  <td className="py-2">{inv.email}</td>
                  <td className="py-2">{inv.proposedVendorOrgName}</td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            const { acceptUrl } = await resendVendorInvitationAction(inv.id);
                            setLastAcceptUrl(acceptUrl);
                            refresh();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Action failed");
                          }
                        })
                      }
                      className="mr-2 text-xs text-primary hover:underline"
                      disabled={pending}
                    >
                      Resend
                    </button>
                    <button
                      onClick={withConfirm(
                        () => cancelVendorInvitationAction(inv.id),
                        `Cancel the invite to ${inv.email}?`,
                      )}
                      className="text-xs text-destructive hover:underline"
                      disabled={pending}
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Active partnerships</h2>
        {partnerships.length === 0 ? (
          <p className="text-xs text-muted-foreground">No vendor partnerships yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2">Vendor org</th>
                <th className="py-2">Status</th>
                <th className="py-2">Started</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {partnerships.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2">{p.vendorOrgName ?? p.vendorOrgId}</td>
                  <td className="py-2">
                    <span
                      className={
                        p.status === "active"
                          ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300"
                          : "rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300"
                      }
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-right">
                    {p.status === "active" ? (
                      <button
                        onClick={withConfirm(
                          () => pauseVendorPartnershipAction(p.id),
                          `Pause ${p.vendorOrgName ?? "this vendor"}? Their access stops on the next request.`,
                        )}
                        className="mr-2 text-xs text-amber-700 hover:underline dark:text-amber-300"
                        disabled={pending}
                      >
                        Pause
                      </button>
                    ) : (
                      <button
                        onClick={withConfirm(
                          () => resumeVendorPartnershipAction(p.id),
                          `Resume ${p.vendorOrgName ?? "this vendor"}?`,
                        )}
                        className="mr-2 text-xs text-emerald-700 hover:underline dark:text-emerald-300"
                        disabled={pending}
                      >
                        Resume
                      </button>
                    )}
                    <button
                      onClick={withConfirm(
                        () => revokeVendorPartnershipAction(p.id),
                        `Permanently revoke ${p.vendorOrgName ?? "this vendor"}? Their work stays attributed; access cannot be restored without re-inviting.`,
                      )}
                      className="text-xs text-destructive hover:underline"
                      disabled={pending}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
