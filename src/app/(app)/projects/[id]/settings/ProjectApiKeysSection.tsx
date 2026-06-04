"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { mintApiKeyAction, revokeApiKeyAction } from "@/actions/integration/api-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ProjectApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  status: "active" | "revoked" | "expired";
}

const STATUS_COLOR: Record<ProjectApiKeyRow["status"], string> = {
  active: "text-green-600",
  revoked: "text-muted-foreground line-through",
  expired: "text-amber-600",
};

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded border border-border/60 bg-background px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/40"
    >
      {copied ? <Check className="h-3 w-3 text-trend-up" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

interface Props {
  projectId: string;
  initialKeys: ProjectApiKeyRow[];
}

export function ProjectApiKeysSection({ projectId, initialKeys }: Props) {
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
        const result = await mintApiKeyAction({ name: name.trim(), projectId, expiresAt });
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
    <section id="api-keys" className="space-y-4">
      <header className="space-y-1">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          API keys
        </h3>
        <p className="text-xs text-muted-foreground">
          Bearer tokens for the <code className="font-mono">/api/v1</code> agent surface. Every
          key is bound to this project — the IDE session auto-binds from the key at handshake.
          The plaintext is shown once on creation.
        </p>
      </header>

      {revealedPlaintext ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-950/40">
          <div className="font-medium text-amber-900 dark:text-amber-200">
            Save this key now — it will not be shown again.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <pre className="flex-1 overflow-x-auto rounded bg-white p-2 font-mono text-xs dark:bg-background">
              {revealedPlaintext}
            </pre>
            <CopyButton text={revealedPlaintext} label="Copy key" />
          </div>
          <button
            type="button"
            onClick={() => setRevealedPlaintext(null)}
            className="mt-2 text-xs text-amber-900 underline dark:text-amber-200"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <form
        onSubmit={handleMint}
        className="grid grid-cols-[1fr_140px_auto] items-end gap-3 rounded border p-4"
      >
        <div className="space-y-1">
          <Label htmlFor="api-key-name" className="text-xs">
            Name
          </Label>
          <Input
            id="api-key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. cursor-laptop"
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="api-key-expiry" className="text-xs">
            Expires in (days)
          </Label>
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
        <div className="rounded border bg-muted/30 p-6 text-sm text-muted-foreground">
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevoke(k.id)}
                      disabled={pending}
                    >
                      Revoke
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
