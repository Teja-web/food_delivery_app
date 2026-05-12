"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectSlug: string;
  apiKeyPrefix: string;
  apiKeyPlaintext: string | null;
  isNewKey: boolean;
};

function buildSnippet(slug: string, key: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        coznt: {
          command: "npx",
          args: ["-y", "@coznt/mcp"],
          env: {
            COZNT_API_KEY: key,
            COZNT_PROJECT: slug,
            COZNT_URL: "https://coznt.example.com",
          },
        },
      },
    },
    null,
    2,
  );
}

export function ConnectCursorModal({
  open,
  onOpenChange,
  projectSlug,
  apiKeyPrefix,
  apiKeyPlaintext,
  isNewKey,
}: Props) {
  const [copied, setCopied] = useState(false);
  const keyShown = apiKeyPlaintext ?? `${apiKeyPrefix}…`;
  const snippet = buildSnippet(projectSlug, keyShown);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
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
          <DialogTitle>Connect this project to Cursor</DialogTitle>
          <DialogDescription>
            Drop the snippet into <span className="font-mono text-foreground">.cursor/mcp.json</span> in
            your repo. Cursor will load your project&apos;s plans, gates, and rules into context.
          </DialogDescription>
        </DialogHeader>

        {isNewKey && apiKeyPlaintext ? (
          <div className="rounded-md border border-state-pending/40 bg-state-pending/10 px-3 py-2 text-xs text-state-pending">
            We just minted this project-scoped key. <strong>Copy it now</strong> — for security
            it will only be visible this once. Future rotation lives on{" "}
            <span className="font-mono">/api-keys</span>.
          </div>
        ) : null}

        <div className="relative">
          <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
            {snippet}
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

        <div className={cn("text-xs text-muted-foreground")}>
          Key prefix:{" "}
          <span className="font-mono text-foreground">{apiKeyPrefix}…</span>
        </div>

        <DialogFooter className="gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href="https://docs.cursor.com/mcp" target="_blank" rel="noreferrer">
              Setup docs
              <ExternalLink className="ml-1 h-3 w-3" aria-hidden />
            </a>
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
