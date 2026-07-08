"use client";

import { Check, ChevronDown, ChevronRight, Copy, KeyRound, Plus, Search, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { revokeApiKeyAction } from "@/actions/integration/api-keys";
import { MintApiKeyDialog } from "@/components/api-keys/MintApiKeyDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_KEY_ROLE_LABELS, type ApiKeyRole } from "@/lib/auth/api-key-roles";
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
  manager: "border-yellow-400/50 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300",
  admin: "border-red-400/50 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
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
  canCreateApiKeys: boolean;
}

type StatusFilter = "all" | ApiKeyStatus;

export function ApiKeysAuditClient({ kpis, groups, rows, projects, canCreateApiKeys }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [mintOpen, setMintOpen] = useState(false);

  const matches = (row: ApiKeyRow) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (projectFilter !== "all" && row.projectId !== projectFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !row.name.toLowerCase().includes(q) &&
        !row.prefix.toLowerCase().includes(q) &&
        !row.projectName.toLowerCase().includes(q) &&
        !(row.createdByEmail?.toLowerCase().includes(q) ?? false)
      ) {
        return false;
      }
    }
    return true;
  };

  const filteredGroups = useMemo(() => {
    return groups
      .map((group) => ({ ...group, keys: group.keys.filter(matches) }))
      .filter((group) => group.keys.length > 0);
  }, [groups, search, projectFilter, statusFilter]);

  const visibleCount = filteredGroups.reduce((count, group) => count + group.keys.length, 0);

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
        <div className="relative min-w-[220px] flex-1">
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
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
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
            disabled={projects.length === 0 || !canCreateApiKeys}
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
          {filteredGroups.map((group) => {
            const groupId = group.projectId ?? "__orphaned__";
            const collapsed = collapsedProjects.has(groupId);

            return (
              <div key={groupId} className="overflow-hidden rounded-lg border bg-card/30">
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
                    {group.projectId ? (
                      <Link
                        href={`/projects/${group.projectId}/settings#api-keys`}
                        onClick={(e) => e.stopPropagation()}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {group.projectName}
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1 truncate text-sm font-medium text-amber-600">
                        <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                        {group.projectName}
                      </span>
                    )}
                    {group.projectSlug ? (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {group.projectSlug}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>
                      <span className="font-medium text-trend-up">{group.active}</span> active /{" "}
                      {group.total} total
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
                      {group.keys.map((key) => (
                        <tr key={key.id} className="border-t">
                          <td className="px-4 py-2">{key.name}</td>
                          <td className="px-2 py-2 font-mono text-[11px]">{key.prefix}...</td>
                          <td className="px-2 py-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "px-1.5 py-0 font-mono text-[10px] uppercase",
                                ROLE_STYLES[key.role] ?? ROLE_STYLES.member,
                              )}
                            >
                              {API_KEY_ROLE_LABELS[key.role as ApiKeyRole] ?? key.role}
                            </Badge>
                          </td>
                          <td className={cn("px-2 py-2 text-xs", STATUS_STYLES[key.status])}>
                            {STATUS_LABEL[key.status]}
                          </td>
                          <td
                            className="px-2 py-2 text-xs text-muted-foreground"
                            title={formatTimestamp(key.lastUsedAt)}
                          >
                            {formatRelative(key.lastUsedAt)}
                          </td>
                          <td className="px-2 py-2 text-xs text-muted-foreground">
                            {key.createdByName ?? key.createdByEmail ?? "-"}
                          </td>
                          <td className="px-2 py-2 text-xs text-muted-foreground">
                            {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : "never"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {key.status === "active" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRevoke(key.id)}
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

      <MintApiKeyDialog
        open={mintOpen}
        onOpenChange={setMintOpen}
        projects={projects}
        defaultProjectId={projectFilter !== "all" ? projectFilter : projects[0]?.id ?? ""}
        canCreateApiKeys={canCreateApiKeys}
      />
    </div>
  );
}
