"use client";

import { useState } from "react";
import Link from "next/link";
import { Plug } from "lucide-react";

import { Button } from "@/components/ui/button";

import { ConnectIdeModal } from "../../ConnectIdeModal";

interface Props {
  projectId: string;
  projectSlug: string;
  apiKeyPrefix: string | null;
}

export function ConnectAgentSection(props: Props) {
  const [open, setOpen] = useState(false);
  const hasKey = props.apiKeyPrefix !== null;

  return (
    <section className="space-y-3 rounded-md border bg-card p-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Connect IDE / AI agent</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Coznt&apos;s MCP server speaks to any MCP-capable agent — Claude Code,
            Cursor, Codex, Cline, Zed, Continue, and more. Pick the host you use
            and drop the snippet into its config file.
          </p>
        </div>
        {hasKey ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Plug className="h-3.5 w-3.5" aria-hidden /> View setup snippet
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${props.projectId}/settings/api-keys`}>
              <Plug className="h-3.5 w-3.5" aria-hidden /> Mint a key to connect
            </Link>
          </Button>
        )}
      </header>

      {hasKey ? (
        <ConnectIdeModal
          open={open}
          onOpenChange={setOpen}
          projectSlug={props.projectSlug}
          apiKeyPrefix={props.apiKeyPrefix as string}
          apiKeyPlaintext={null}
          isNewKey={false}
        />
      ) : null}
    </section>
  );
}
