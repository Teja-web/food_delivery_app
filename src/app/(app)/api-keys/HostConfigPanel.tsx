"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
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

interface Props {
  plaintext: string | null;
}

/**
 * In-product replacement for the old `docs/operate/mcp-clients/*.json`
 * reference files. Renders the full config payload for the selected host
 * with the just-minted key (or a `${COZNT_API_KEY}` env placeholder when
 * the user pulls this up later).
 *
 * Pure client component — no network call. `renderHostConfig` is
 * isomorphic and the plaintext lives only in the browser.
 */
export function HostConfigPanel({ plaintext }: Props) {
  const [host, setHost] = useState<HostName>("claude-code");
  const [copied, setCopied] = useState(false);

  const serverUrl =
    typeof window !== "undefined" ? window.location.origin : "https://your.coznt.host";
  const apiKey = plaintext ?? "${COZNT_API_KEY}";

  const rendered = useMemo(
    () => renderHostConfig(host, { serverUrl, apiKey, mcpVersion: MCP_VERSION }),
    [host, serverUrl, apiKey],
  );

  const body = rendered.serialized;
  const mime = rendered.format === "toml" ? "application/toml" : "application/json";

  function copy() {
    navigator.clipboard.writeText(body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function download() {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Strip the leading `.` from `.claude/mcp.json` so it doesn't try to
    // save as a dotfile in the browser's download dir.
    a.download = rendered.path.replace(/^\./, "").replace(/\//g, "_");
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card/30 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">Host MCP config</div>
          <p className="text-xs text-muted-foreground">
            Prefer <code className="font-mono">coznt connect</code> — it merges this into the
            host&apos;s existing config. Use this panel only when the CLI isn&apos;t available.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={host} onValueChange={(v) => setHost(v as HostName)}>
            <SelectTrigger className="w-[180px]">
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
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-trend-up" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" onClick={download}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="text-[11px] text-muted-foreground">
          Paste into <code className="font-mono">{rendered.path}</code>
          {rendered.pathKind === "home" ? <> in the user&apos;s home directory</> : <> in the dev&apos;s repo</>}.
          {!plaintext ? (
            <>
              {" "}The <code className="font-mono">COZNT_API_KEY</code> placeholder expects an
              env var the host inherits.
            </>
          ) : (
            <>
              {" "}Plaintext key embedded — only available right after mint.
            </>
          )}
        </div>
        <pre className="overflow-x-auto rounded-md border border-border/40 bg-background/70 p-3 font-mono text-[11px] leading-relaxed">
          {body}
        </pre>
      </div>
    </div>
  );
}
