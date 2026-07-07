"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { revokeApiKeyAction } from "@/actions/integration/api-keys";
import { MintApiKeyDialog } from "@/components/api-keys/MintApiKeyDialog";
import { Button } from "@/components/ui/button";
import { API_KEY_ROLE_LABELS, type ApiKeyRole } from "@/lib/auth/api-key-roles";

export interface ProjectApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  role: ApiKeyRole;
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

const ROLE_COLOR: Record<ApiKeyRole, string> = {
  member: "text-muted-foreground",
  manager: "text-yellow-700 dark:text-yellow-300",
  admin: "text-red-700 dark:text-red-300",
};

interface Props {
  projectId: string;
  projectName: string;
  projectSlug: string;
  initialKeys: ProjectApiKeyRow[];
  canCreateApiKeys: boolean;
}

export function ProjectApiKeysSection({
  projectId,
  projectName,
  projectSlug,
  initialKeys,
  canCreateApiKeys,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showRevoked, setShowRevoked] = useState(false);
  const [mintOpen, setMintOpen] = useState(false);

  const revokedCount = initialKeys.filter((key) => key.status === "revoked").length;
  const visibleKeys = showRevoked
    ? initialKeys
    : initialKeys.filter((key) => key.status !== "revoked");

  function handleRevoke(id: string) {
    if (!confirm("Revoke this API key? Future requests will be rejected.")) return;
    startTransition(async () => {
      await revokeApiKeyAction(id);
      router.refresh();
    });
  }

  return (
    <section id="api-keys" className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            API keys
          </h3>
          <p className="text-xs text-muted-foreground">
            Bearer tokens for the <code className="font-mono">/api/v1</code> agent surface. Every
            key is bound to this project - the IDE session auto-binds from the key at handshake.
            The plaintext is shown once on creation.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMintOpen(true)}
          disabled={!canCreateApiKeys}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Mint key
        </Button>
      </header>

      {!canCreateApiKeys ? (
        <div className="rounded border bg-muted/30 p-3 text-sm text-muted-foreground">
          Only project owners can mint API keys and assign roles.
        </div>
      ) : null}

      {initialKeys.length === 0 ? (
        <div className="rounded border bg-muted/30 p-6 text-sm text-muted-foreground">
          No API keys yet. Mint one to call <code>/api/v1</code> from agents or CI.
        </div>
      ) : (
        <>
          {revokedCount > 0 ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowRevoked((value) => !value)}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {showRevoked ? `Hide revoked (${revokedCount})` : `Show revoked (${revokedCount})`}
              </button>
            </div>
          ) : null}
          <table className="w-full border-collapse text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="border-b py-2 font-medium">Name</th>
                <th className="border-b py-2 font-medium">Prefix</th>
                <th className="border-b py-2 font-medium">Role</th>
                <th className="border-b py-2 font-medium">Status</th>
                <th className="border-b py-2 font-medium">Last used</th>
                <th className="border-b py-2 font-medium">Expires</th>
                <th className="border-b py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visibleKeys.map((key) => (
                <tr key={key.id} className="border-b">
                  <td className="py-2">{key.name}</td>
                  <td className="py-2 font-mono text-xs">{key.prefix}...</td>
                  <td className={`py-2 text-xs font-medium ${ROLE_COLOR[key.role]}`}>
                    {API_KEY_ROLE_LABELS[key.role]}
                  </td>
                  <td className={`py-2 ${STATUS_COLOR[key.status]}`}>{key.status}</td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "never"}
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : "never"}
                  </td>
                  <td className="py-2 text-right">
                    {key.status === "active" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevoke(key.id)}
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
        </>
      )}

      <MintApiKeyDialog
        open={mintOpen}
        onOpenChange={setMintOpen}
        projects={[{ id: projectId, name: projectName, slug: projectSlug }]}
        defaultProjectId={projectId}
        lockedProjectId={projectId}
        canCreateApiKeys={canCreateApiKeys}
        description="Create a project-scoped bearer token for this project's agents, IDE integrations, or CI jobs."
      />
    </section>
  );
}
