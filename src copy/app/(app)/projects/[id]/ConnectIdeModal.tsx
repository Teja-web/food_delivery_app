"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HOST_SHAPES,
  SUPPORTED_HOSTS,
  renderHostConfig,
  type HostName,
} from "@/lib/agent-context/host-config";
import { MCP_VERSION } from "@/lib/agent-context/version";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectSlug: string;
  apiKeyPrefix: string;
  apiKeyPlaintext: string | null;
  isNewKey: boolean;
};

const HOST_DOCS: Partial<Record<HostName, string>> = {
  "claude-code": "https://docs.claude.com/en/docs/claude-code/mcp",
  cursor: "https://docs.cursor.com/mcp",
  cline: "https://docs.cline.bot/mcp/configuring-mcp-servers",
  zed: "https://zed.dev/docs/assistant/model-context-protocol",
  continue: "https://docs.continue.dev/customize/deep-dives/mcp",
  codex: "https://github.com/openai/codex",
};

export function ConnectIdeModal({
  open,
  onOpenChange,
  projectSlug,
  apiKeyPrefix,
  apiKeyPlaintext,
  isNewKey,
}: Props) {
  const [host, setHost] = useState<HostName>("claude-code");
  const [copied, setCopied] = useState(false);

  const keyShown = apiKeyPlaintext ?? `${apiKeyPrefix}…`;
  const serverUrl =
    typeof window !== "undefined" ? window.location.origin : "https://your.coznt.host";

  const rendered = useMemo(
    () =>
      renderHostConfig(host, {
        serverUrl,
        apiKey: keyShown,
        mcpVersion: MCP_VERSION,
        extraEnv: { COZNT_PROJECT: projectSlug },
      }),
    [host, serverUrl, keyShown, projectSlug],
  );

  const shape = HOST_SHAPES[host];
  const docsHref = HOST_DOCS[host];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rendered.serialized);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — leave the snippet visible for manual copy
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect this project to your IDE</DialogTitle>
          <DialogDescription>
            Pick your agent, then drop the snippet into its MCP config file. The
            agent will load this project&apos;s plans, gates, and rules into context.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label htmlFor="ide-host" className="text-xs font-medium">
            Agent
          </label>
          <Select value={host} onValueChange={(v) => setHost(v as HostName)}>
            <SelectTrigger id="ide-host">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_HOSTS.map((h) => (
                <SelectItem key={h} value={h}>
                  {HOST_SHAPES[h].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            File path:{" "}
            <span className="font-mono text-foreground">{shape.path}</span>{" "}
            ({rendered.pathKind === "home" ? "in your home directory" : "at the repo root"})
          </p>
        </div>

        {isNewKey && apiKeyPlaintext ? (
          <div className="rounded-md border border-state-pending/40 bg-state-pending/10 px-3 py-2 text-xs text-state-pending">
            We just minted this project-scoped key. <strong>Copy it now</strong> — for security
            it will only be visible this once. Future rotation lives on{" "}
            <span className="font-mono">/api-keys</span>.
          </div>
        ) : null}

        <div className="relative">
          <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
            {rendered.serialized}
          </pre>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="absolute top-2 right-2"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden /> Copy snippet
              </>
            )}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          Key prefix:{" "}
          <span className="font-mono text-foreground">{apiKeyPrefix}…</span>
        </div>

        <DialogFooter className="gap-2">
          {docsHref ? (
            <Button asChild variant="ghost" size="sm">
              <a href={docsHref} target="_blank" rel="noreferrer">
                Setup docs
                <ExternalLink className="ml-1 h-3 w-3" aria-hidden />
              </a>
            </Button>
          ) : null}
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
