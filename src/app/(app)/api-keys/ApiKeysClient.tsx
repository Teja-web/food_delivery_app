"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mintApiKeyAction, revokeApiKeyAction } from "@/actions/api-keys";
import type { ApiKeyRow } from "./serialize";

const STATUS_COLOR: Record<ApiKeyRow["status"], string> = {
  active: "text-green-600",
  revoked: "text-muted-foreground line-through",
  expired: "text-amber-600",
};

export function ApiKeysClient({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [revealedPlaintext, setRevealedPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleMint(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const days = expiresInDays.trim() ? Number(expiresInDays) : null;
    if (days !== null && (!Number.isFinite(days) || days <= 0)) {
      setError("Expiration must be a positive number of days");
      return;
    }
    const expiresAt = days ? new Date(Date.now() + days * 86_400_000) : null;

    startTransition(async () => {
      try {
        const result = await mintApiKeyAction({ name: name.trim(), expiresAt });
        setRevealedPlaintext(result.plaintext);
        setName("");
        setExpiresInDays("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to mint key");
      }
    });
  }

  function handleRevoke(id: string) {
    if (!confirm("Revoke this API key? Future requests will be rejected.")) return;
    startTransition(async () => {
      await revokeApiKeyAction(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {revealedPlaintext ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          <div className="font-medium text-amber-900">Save this key now — it will not be shown again.</div>
          <pre className="mt-2 overflow-x-auto rounded bg-white p-2 font-mono text-xs">{revealedPlaintext}</pre>
          <button
            type="button"
            onClick={() => setRevealedPlaintext(null)}
            className="mt-2 text-xs text-amber-900 underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <form onSubmit={handleMint} className="grid grid-cols-[1fr_180px_auto] items-end gap-3 rounded border p-4">
        <div className="space-y-1">
          <Label htmlFor="api-key-name">Name</Label>
          <Input
            id="api-key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. github-ci-runner"
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="api-key-expiry">Expires in (days)</Label>
          <Input
            id="api-key-expiry"
            type="number"
            min="1"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value)}
            placeholder="never"
            disabled={pending}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Minting…" : "Mint key"}
        </Button>
        {error ? <div className="col-span-3 text-sm text-destructive">{error}</div> : null}
      </form>

      {initialKeys.length === 0 ? (
        <div className="rounded border bg-muted/30 p-8 text-sm text-muted-foreground">
          No API keys yet. Mint one above to call <code>/api/v1</code> from agents or CI.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="border-b py-2 font-medium">Name</th>
              <th className="border-b py-2 font-medium">Prefix</th>
              <th className="border-b py-2 font-medium">Status</th>
              <th className="border-b py-2 font-medium">Last used</th>
              <th className="border-b py-2 font-medium">Expires</th>
              <th className="border-b py-2"></th>
            </tr>
          </thead>
          <tbody>
            {initialKeys.map((k) => (
              <tr key={k.id} className="border-b">
                <td className="py-2">{k.name}</td>
                <td className="py-2 font-mono text-xs">{k.prefix}…</td>
                <td className={`py-2 ${STATUS_COLOR[k.status]}`}>{k.status}</td>
                <td className="py-2 text-xs text-muted-foreground">
                  {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "never"}
                </td>
                <td className="py-2 text-xs text-muted-foreground">
                  {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "never"}
                </td>
                <td className="py-2 text-right">
                  {k.status === "active" ? (
                    <Button variant="outline" size="sm" onClick={() => handleRevoke(k.id)} disabled={pending}>
                      Revoke
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
