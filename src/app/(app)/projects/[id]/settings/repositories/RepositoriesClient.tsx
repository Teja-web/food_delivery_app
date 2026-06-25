"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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

import {
  addRepositoryToProject,
  removeRepository,
} from "@/actions/project/repositories";
import {
  REPOSITORY_SOURCES,
  type RepositorySource,
} from "@/db/schema/repository";

interface RepoRow {
  id: string;
  source: RepositorySource;
  identifier: string;
  url: string | null;
  defaultBranch: string | null;
}

interface Props {
  projectId: string;
  repos: RepoRow[];
  connectedProviders: RepositorySource[];
}

const SOURCE_META: Record<
  RepositorySource,
  { label: string; identifierLabel: string; identifierPlaceholder: string }
> = {
  github: {
    label: "GitHub",
    identifierLabel: "owner/repo",
    identifierPlaceholder: "acme/api",
  },
  jira: {
    label: "Jira",
    identifierLabel: "Project key",
    identifierPlaceholder: "ACME",
  },
  ado: {
    label: "Azure DevOps",
    identifierLabel: "org/project",
    identifierPlaceholder: "acme-org/MyProject",
  },
  confluence: {
    label: "Confluence",
    identifierLabel: "Space key",
    identifierPlaceholder: "ENG",
  },
};

export function RepositoriesClient({ projectId, repos, connectedProviders }: Props) {
  const [open, setOpen] = useState(false);
  const connected = new Set(connectedProviders);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Sources</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Code and tracker sources bound to this project. Credentials for each
            source are configured once at the{" "}
            <Link href="/integrations" className="underline hover:no-underline">
              workspace adapters
            </Link>{" "}
            level.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add
        </Button>
      </header>

      {repos.length === 0 ? (
        <div className="rounded border bg-muted/20 p-6 text-sm text-muted-foreground">
          No sources bound yet.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Identifier</th>
              <th className="px-3 py-2 font-medium">URL</th>
              <th className="px-3 py-2 font-medium">Adapter</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {repos.map((r) => (
              <RepoTableRow key={r.id} repo={r} adapterConnected={connected.has(r.source)} />
            ))}
          </tbody>
        </table>
      )}

      <AddDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        connectedProviders={connected}
      />
    </div>
  );
}

function RepoTableRow({
  repo,
  adapterConnected,
}: {
  repo: RepoRow;
  adapterConnected: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function onRemove() {
    if (!confirm(`Unbind ${repo.source} ${repo.identifier} from this project?`)) return;
    startTransition(async () => {
      try {
        await removeRepository(repo.id);
        toast.success("Source unbound");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Remove failed");
      }
    });
  }

  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="px-3 py-2">
        <Badge variant="outline" className="font-mono text-[10px] uppercase">
          {repo.source}
        </Badge>
      </td>
      <td className="px-3 py-2 font-mono text-xs">{repo.identifier}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {repo.url ? (
          <a href={repo.url} target="_blank" rel="noreferrer" className="hover:underline">
            {repo.url}
          </a>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        {adapterConnected ? (
          <span className="text-muted-foreground">Credentials configured</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Not configured
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <Button
          variant="ghost"
          size="icon"
          disabled={isPending}
          onClick={onRemove}
          aria-label="Remove source"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

function AddDialog({
  open,
  onOpenChange,
  projectId,
  connectedProviders,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  connectedProviders: Set<RepositorySource>;
}) {
  const [source, setSource] = useState<RepositorySource>("github");
  const [identifier, setIdentifier] = useState("");
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  const meta = SOURCE_META[source];
  const adapterMissing = !connectedProviders.has(source);

  function reset() {
    setSource("github");
    setIdentifier("");
    setUrl("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await addRepositoryToProject({
          projectId,
          source,
          identifier,
          url: url.trim() || null,
        });
        toast.success(`Bound ${source} ${identifier}`);
        onOpenChange(false);
        reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Add failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add source</DialogTitle>
          <DialogDescription>
            Bind a code or tracker source to this project. Workspace credentials
            handle authentication.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="repo-source" className="text-xs">
              Source
            </Label>
            <Select
              value={source}
              onValueChange={(v) => setSource(v as RepositorySource)}
            >
              <SelectTrigger id="repo-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPOSITORY_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SOURCE_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="repo-identifier" className="text-xs">
              {meta.identifierLabel}
            </Label>
            <Input
              id="repo-identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={meta.identifierPlaceholder}
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="repo-url" className="text-xs">
              URL <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="repo-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          {adapterMissing ? (
            <p className="flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>
                No <strong>{meta.label}</strong> adapter configured at the workspace
                level. Bind anyway — sync starts once it&apos;s connected via{" "}
                <Link href="/integrations" className="underline">
                  Adapters
                </Link>
                .
              </span>
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!identifier.trim() || isPending}>
              {isPending ? "Adding…" : "Add source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
