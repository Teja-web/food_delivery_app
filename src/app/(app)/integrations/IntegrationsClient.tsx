"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ExternalLink,
  GitBranch,
  GitMerge,
  Loader2,
  Plug,
  Settings2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveIntegrationCredentialsAction,
  disconnectIntegrationAction,
} from "@/actions/integration/integrations";
import type {
  AdapterProvider,
  BindingRow,
  IntegrationsOverview,
  ProviderRow,
} from "./serialize";

interface ConfigField {
  key: "baseUrl" | "email" | "orgUrl";
  label: string;
  placeholder: string;
  type?: "text" | "email" | "url";
  required: boolean;
}

interface ProviderDef {
  id: AdapterProvider;
  name: string;
  description: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  apiKeyHint: string;
  docsHref: string;
  externalKeyHint: string;
  configFields: ConfigField[];
  Icon: typeof GitMerge;
  accent: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "github",
    name: "GitHub",
    description: "Pull PRs, deploys, and review activity. Bind each coznt project to a repo.",
    apiKeyLabel: "Personal access token (classic) or fine-grained PAT",
    apiKeyPlaceholder: "ghp_…",
    apiKeyHint: "Scopes: repo, read:org. For Enterprise, use a PAT issued by your GHE instance.",
    docsHref: "https://github.com/settings/tokens",
    externalKeyHint: "host/owner/repo — e.g. github.com/acme/api",
    configFields: [],
    Icon: GitBranch,
    accent: "from-slate-100 to-slate-50 dark:from-slate-900 dark:to-slate-950",
  },
  {
    id: "jira",
    name: "Jira",
    description: "Sync issues, sprints, and statuses. Bind each coznt project to a Jira site and project key.",
    apiKeyLabel: "API token",
    apiKeyPlaceholder: "ATATT…",
    apiKeyHint: "Create at id.atlassian.com → Security → API tokens. Combined with your account email.",
    docsHref: "https://id.atlassian.com/manage-profile/security/api-tokens",
    externalKeyHint: "site/project key - e.g. acme.atlassian.net/ACME",
    configFields: [
      { key: "baseUrl", label: "Site URL", placeholder: "https://acme.atlassian.net", type: "url", required: true },
      { key: "email", label: "Account email", placeholder: "you@acme.com", type: "email", required: true },
    ],
    Icon: Plug,
    accent: "from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950",
  },
  {
    id: "ado",
    name: "Azure DevOps",
    description: "Read work items and pipelines. Bind each coznt project to an ADO project.",
    apiKeyLabel: "Personal access token (PAT)",
    apiKeyPlaceholder: "PAT",
    apiKeyHint: "Scopes: Work Items (read), Build (read), Code (read).",
    docsHref: "https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate",
    externalKeyHint: "organization/project — e.g. acme-org/api",
    configFields: [
      { key: "orgUrl", label: "Org URL", placeholder: "https://dev.azure.com/acme-org", type: "url", required: true },
    ],
    Icon: Plug,
    accent: "from-sky-50 to-cyan-50 dark:from-sky-950 dark:to-cyan-950",
  },
  {
    id: "confluence",
    name: "Confluence",
    description: "Index pages and decisions referenced from coznt plans. Bind by space key.",
    apiKeyLabel: "API token",
    apiKeyPlaceholder: "ATATT…",
    apiKeyHint: "Same token system as Jira — id.atlassian.com → API tokens.",
    docsHref: "https://id.atlassian.com/manage-profile/security/api-tokens",
    externalKeyHint: "Confluence space key — e.g. ENG",
    configFields: [
      { key: "baseUrl", label: "Site URL", placeholder: "https://acme.atlassian.net", type: "url", required: true },
      { key: "email", label: "Account email", placeholder: "you@acme.com", type: "email", required: true },
    ],
    Icon: Plug,
    accent: "from-violet-50 to-fuchsia-50 dark:from-violet-950 dark:to-fuchsia-950",
  },
];

export function IntegrationsClient({ overview }: { overview: IntegrationsOverview }) {
  const router = useRouter();
  const statusByProvider = new Map(overview.providers.map((p) => [p.provider, p]));
  const bindingsByProvider = groupBindings(overview.bindings);

  return (
    <div className="space-y-4">
      {PROVIDERS.map((def) => {
        const status = statusByProvider.get(def.id);
        if (!status) return null;
        return (
          <ProviderCard
            key={def.id}
            def={def}
            status={status}
            bindings={bindingsByProvider.get(def.id) ?? []}
            onChange={() => router.refresh()}
          />
        );
      })}
    </div>
  );
}

function ProviderCard({
  def,
  status,
  bindings,
  onChange,
}: {
  def: ProviderDef;
  status: ProviderRow;
  bindings: BindingRow[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showBindings, setShowBindings] = useState(false);

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className={`rounded-t-lg bg-gradient-to-r ${def.accent} px-5 py-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md border border-border/60 bg-background/80 p-2">
              <def.Icon className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">{def.name}</h2>
                <StatusBadge configured={status.configured} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{def.description}</p>
            </div>
          </div>
          <a
            href={def.docsHref}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Token docs <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div className="px-5 py-4">
        {!editing && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
              {status.configured ? (
                <>
                  {Object.entries(status.config).map(([k, v]) => (
                    <span key={k}>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground/80">{k}</span>{" "}
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{v}</code>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowBindings((v) => !v)}
                    className="text-xs underline-offset-2 hover:underline"
                  >
                    {status.bindingCount} {status.bindingCount === 1 ? "binding" : "bindings"}
                  </button>
                  {status.updatedAt && (
                    <span className="text-xs">Updated {timeAgo(status.updatedAt)}</span>
                  )}
                </>
              ) : (
                <span>Not connected. Configure credentials to enable this adapter.</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {status.configured ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Update
                  </Button>
                  <DisconnectButton provider={def.id} onDone={onChange} />
                </>
              ) : (
                <Button size="sm" onClick={() => setEditing(true)}>
                  <Plug className="mr-1.5 h-3.5 w-3.5" /> Configure
                </Button>
              )}
            </div>
          </div>
        )}

        {editing && (
          <CredentialsForm
            def={def}
            initialConfig={status.config}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              onChange();
            }}
          />
        )}

        {showBindings && status.configured && !editing && (
          <div className="mt-4 rounded border border-dashed bg-muted/30 p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Project bindings
            </div>
            {bindings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects bound yet. Add a binding from a project's settings page.{" "}
                <span className="text-xs">External key format: {def.externalKeyHint}</span>
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {bindings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                    <Link
                      href={`/projects/${b.projectId}`}
                      className="font-medium hover:underline"
                    >
                      {b.projectName ?? b.projectId}
                    </Link>
                    <code className="rounded bg-background px-2 py-0.5 text-xs text-muted-foreground">
                      {b.externalKey}
                    </code>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CredentialsForm({
  def,
  initialConfig,
  onCancel,
  onSaved,
}: {
  def: ProviderDef;
  initialConfig: Record<string, string>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [config, setConfig] = useState<Record<string, string>>(initialConfig);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!apiKey.trim()) {
      setError("API key / token is required");
      return;
    }
    for (const field of def.configFields) {
      if (field.required && !config[field.key]?.trim()) {
        setError(`${field.label} is required`);
        return;
      }
    }
    startSave(async () => {
      try {
        await saveIntegrationCredentialsAction({
          provider: def.id,
          apiKey: apiKey.trim(),
          config: Object.fromEntries(
            Object.entries(config)
              .filter(([, v]) => v && v.trim() !== "")
              .map(([k, v]) => [k, v.trim()]),
          ),
        });
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-1 space-y-4">
      {def.configFields.map((field) => (
        <div key={field.key} className="space-y-1">
          <Label htmlFor={`${def.id}-${field.key}`}>{field.label}</Label>
          <Input
            id={`${def.id}-${field.key}`}
            type={field.type ?? "text"}
            placeholder={field.placeholder}
            value={config[field.key] ?? ""}
            onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
            required={field.required}
          />
        </div>
      ))}
      <div className="space-y-1">
        <Label htmlFor={`${def.id}-apikey`}>{def.apiKeyLabel}</Label>
        <Input
          id={`${def.id}-apikey`}
          type="password"
          placeholder={def.apiKeyPlaceholder}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="new-password"
          required
        />
        <p className="text-xs text-muted-foreground">{def.apiKeyHint}</p>
      </div>

      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {saving ? "Saving" : "Save credentials"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DisconnectButton({
  provider,
  onDone,
}: {
  provider: AdapterProvider;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  function handle() {
    if (!confirm("Remove credentials for this adapter? Existing project bindings stay, but adapter API calls will fail until reconfigured.")) {
      return;
    }
    start(async () => {
      await disconnectIntegrationAction(provider);
      onDone();
    });
  }
  return (
    <Button variant="outline" size="sm" onClick={handle} disabled={pending}>
      {pending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
      )}
      Disconnect
    </Button>
  );
}

function StatusBadge({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-300/60 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:border-green-700/60 dark:bg-green-950/40 dark:text-green-400">
        <Check className="h-2.5 w-2.5" /> Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      Not configured
    </span>
  );
}

function groupBindings(bindings: BindingRow[]): Map<AdapterProvider, BindingRow[]> {
  const map = new Map<AdapterProvider, BindingRow[]>();
  for (const b of bindings) {
    const arr = map.get(b.provider) ?? [];
    arr.push(b);
    map.set(b.provider, arr);
  }
  return map;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}
