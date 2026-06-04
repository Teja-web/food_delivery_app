"use client";

import { Check, ChevronDown, ChevronRight, Copy, KeyRound, Plus, Search, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { mintApiKeyAction, revokeApiKeyAction } from "@/actions/integration/api-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type {
  ApiKeyRow,
  ApiKeyStatus,
  OrgKpis,
  ProjectGroup,
  ProjectOption,
} from "./serialize";

const STATUS_STYLES: Record<ApiKeyStatus, string> = {
  active: "text-trend-up",
  revoked: "text-muted-foreground line-through",
  expired: "text-amber-600",
};

const STATUS_LABEL: Record<ApiKeyStatus, string> = {
  active: "Active",
  revoked: "Revoked",
  expired: "Expired",
};

const ROLE_STYLES: Record<string, string> = {
  member: "border-border/50 text-muted-foreground",
  admin: "border-amber-500/50 text-amber-600",
  owner: "border-amber-600/60 text-amber-700",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="h-7 gap-1 text-[11px]"
    >
      {copied ? <Check className="h-3 w-3 text-trend-up" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy key"}
    </Button>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "good" | "warn" | "muted";
}) {
  return (
    <div className="rounded-lg border bg-card/40 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-2xl font-semibold tabular-nums",
          tone === "good" && "text-trend-up",
          tone === "warn" && "text-amber-600",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function formatTimestamp(iso: string | null, fallback = "never") {
  if (!iso) return fallback;
  return new Date(iso).toLocaleString();
}

function formatRelative(iso: string | null) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface Props {
  kpis: OrgKpis;
  groups: ProjectGroup[];
  rows: ApiKeyRow[];
  projects: ProjectOption[];
}

type StatusFilter = "all" | ApiKeyStatus;

export function ApiKeysAuditClient({ kpis, groups, rows, projects }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [mintOpen, setMintOpen] = useState(false);

  const matches = (r: ApiKeyRow) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (projectFilter !== "all" && r.projectId !== projectFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !r.name.toLowerCase().includes(q) &&
        !r.prefix.toLowerCase().includes(q) &&
        !r.projectName.toLowerCase().includes(q) &&
        !(r.createdByEmail?.toLowerCase().includes(q) ?? false)
      ) {
        return false;
      }
    }
    return true;
  };

  const filteredGroups = useMemo(() => {
    return groups
      .map((g) => ({ ...g, keys: g.keys.filter(matches) }))
      .filter((g) => g.keys.length > 0);
  }, [groups, search, projectFilter, statusFilter]);

  const visibleCount = filteredGroups.reduce((n, g) => n + g.keys.length, 0);
  const hasFilter = search.trim() !== "" || projectFilter !== "all" || statusFilter !== "all";

  function toggleProject(id: string) {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Active" value={kpis.active} tone="good" />
        <StatTile label="Revoked" value={kpis.revoked} tone="muted" />
        <StatTile label="Expired" value={kpis.expired} tone="warn" />
        <StatTile label="Projects" value={kpis.projectsWithKeys} tone="default" />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card/30 p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, prefix, project, or creator email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7"
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {visibleCount} of {rows.length}
          </span>
          <Button
            size="sm"
            onClick={() => setMintOpen(true)}
            disabled={projects.length === 0}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Mint key
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          No API keys yet. Mint one from a project&apos;s Settings tab, or use the button above.
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          No keys match the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((g) => {
            const groupId = g.projectId ?? "__orphaned__";
            const collapsed = collapsedProjects.has(groupId);
            return (
              <div
                key={groupId}
                className="overflow-hidden rounded-lg border bg-card/30"
              >
                <button
                  type="button"
                  onClick={() => toggleProject(groupId)}
                  className="flex w-full items-center justify-between gap-3 border-b bg-muted/20 px-4 py-2 text-left hover:bg-muted/40"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {collapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {g.projectId ? (
                      <Link
                        href={`/projects/${g.projectId}/settings#api-keys`}
                        onClick={(e) => e.stopPropagation()}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {g.projectName}
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1 truncate text-sm font-medium text-amber-600">
                        <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                        {g.projectName}
                      </span>
                    )}
                    {g.projectSlug ? (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {g.projectSlug}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>
                      <span className="font-medium text-trend-up">{g.active}</span> active /{" "}
                      {g.total} total
                    </span>
                  </div>
                </button>
                {!collapsed ? (
                  <table className="w-full border-collapse text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">Name</th>
                        <th className="px-2 py-2 font-medium">Prefix</th>
                        <th className="px-2 py-2 font-medium">Role</th>
                        <th className="px-2 py-2 font-medium">Status</th>
                        <th className="px-2 py-2 font-medium">Last used</th>
                        <th className="px-2 py-2 font-medium">Created by</th>
                        <th className="px-2 py-2 font-medium">Expires</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.keys.map((k) => (
                        <tr key={k.id} className="border-t">
                          <td className="px-4 py-2">{k.name}</td>
                          <td className="px-2 py-2 font-mono text-[11px]">{k.prefix}…</td>
                          <td className="px-2 py-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "px-1.5 py-0 font-mono text-[10px] uppercase",
                                ROLE_STYLES[k.role] ?? ROLE_STYLES.member,
                              )}
                            >
                              {k.role}
                            </Badge>
                          </td>
                          <td className={cn("px-2 py-2 text-xs", STATUS_STYLES[k.status])}>
                            {STATUS_LABEL[k.status]}
                          </td>
                          <td
                            className="px-2 py-2 text-xs text-muted-foreground"
                            title={formatTimestamp(k.lastUsedAt)}
                          >
                            {formatRelative(k.lastUsedAt)}
                          </td>
                          <td className="px-2 py-2 text-xs text-muted-foreground">
                            {k.createdByName ?? k.createdByEmail ?? "—"}
                          </td>
                          <td className="px-2 py-2 text-xs text-muted-foreground">
                            {k.expiresAt
                              ? new Date(k.expiresAt).toLocaleDateString()
                              : "never"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {k.status === "active" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRevoke(k.id)}
                                disabled={pending}
                                className="h-7 text-[11px]"
                              >
                                Revoke
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <MintKeyDialog
        open={mintOpen}
        onOpenChange={setMintOpen}
        projects={projects}
        defaultProjectId={projectFilter !== "all" ? projectFilter : projects[0]?.id ?? ""}
      />
    </div>
  );
}

function MintKeyDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projects: ProjectOption[];
  defaultProjectId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [expiresInDays, setExpiresInDays] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revealedPlaintext, setRevealedPlaintext] = useState<string | null>(null);

  function reset() {
    setName("");
    setExpiresInDays("");
    setError(null);
    setRevealedPlaintext(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!projectId) {
      setError("Pick a project");
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

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mint API key</DialogTitle>
          <DialogDescription>
            Org-admin minting. For day-to-day key creation, prefer the project&apos;s Settings
            tab — that&apos;s also where developers will look.
          </DialogDescription>
        </DialogHeader>

        {revealedPlaintext ? (
          <div className="space-y-3 rounded border border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-950/40">
            <div className="font-medium text-amber-900 dark:text-amber-200">
              Save this key now — it will not be shown again.
            </div>
            <pre className="overflow-x-auto rounded bg-white p-2 font-mono text-xs dark:bg-background">
              {revealedPlaintext}
            </pre>
            <div className="flex items-center justify-end gap-2">
              <CopyButton text={revealedPlaintext} />
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mint-name">Name</Label>
              <Input
                id="mint-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. cursor-laptop"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mint-project">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="mint-project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                        {p.slug}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mint-expiry">Expires in (days)</Label>
              <Input
                id="mint-expiry"
                type="number"
                min="1"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                placeholder="never"
                disabled={pending}
              />
            </div>
            {error ? <div className="text-sm text-destructive">{error}</div> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Minting…" : "Mint key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
