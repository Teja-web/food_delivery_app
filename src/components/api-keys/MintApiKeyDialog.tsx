"use client";

import { Check, Copy } from "lucide-react";
import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { mintApiKeyAction } from "@/actions/integration/api-keys";
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
  API_KEY_ROLE_OPTIONS,
  type ApiKeyRole,
} from "@/lib/auth/api-key-roles";

export interface ApiKeyProjectOption {
  id: string;
  name: string;
  slug: string;
}

const ROLE_OPTION_STYLES: Record<ApiKeyRole, string> = {
  member: "",
  manager: "text-yellow-700 dark:text-yellow-300",
  admin: "text-red-700 dark:text-red-300",
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ApiKeyProjectOption[];
  defaultProjectId: string;
  canCreateApiKeys: boolean;
  description?: string;
  lockedProjectId?: string;
}

export function MintApiKeyDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  canCreateApiKeys,
  description = "Owner-controlled minting. For day-to-day key creation, prefer the project's Settings tab - that's also where developers will look.",
  lockedProjectId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [role, setRole] = useState<ApiKeyRole>("member");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revealedPlaintext, setRevealedPlaintext] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setProjectId(lockedProjectId ?? defaultProjectId);
    }
  }, [defaultProjectId, lockedProjectId, open]);

  function reset() {
    setName("");
    setProjectId(lockedProjectId ?? defaultProjectId);
    setRole("member");
    setExpiresInDays("");
    setError(null);
    setRevealedPlaintext(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
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
        const result = await mintApiKeyAction({ name: name.trim(), projectId, role, expiresAt });
        setRevealedPlaintext(result.plaintext);
        setName("");
        setRole("member");
        setExpiresInDays("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to mint key");
      }
    });
  }

  const projectSelectionLocked = Boolean(lockedProjectId);
  const lockedProject = projectSelectionLocked
    ? projects.find((project) => project.id === lockedProjectId) ?? null
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mint API key</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {revealedPlaintext ? (
          <div className="space-y-3 rounded border border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-950/40">
            <div className="font-medium text-amber-900 dark:text-amber-200">
              Save this key now - it will not be shown again.
            </div>
            <pre className="overflow-x-auto rounded bg-white p-2 font-mono text-xs dark:bg-background">
              {revealedPlaintext}
            </pre>
            <div className="flex items-center justify-end gap-2">
              <CopyButton text={revealedPlaintext} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRevealedPlaintext(null);
                  setName("");
                  setRole("member");
                  setExpiresInDays("");
                  setError(null);
                }}
              >
                Mint another
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
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
                disabled={pending || !canCreateApiKeys}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mint-project">Project</Label>
              <Select
                value={projectId}
                onValueChange={setProjectId}
                disabled={pending || !canCreateApiKeys || projectSelectionLocked}
              >
                <SelectTrigger id="mint-project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                        {project.slug}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {lockedProject ? (
                <p className="text-xs text-muted-foreground">
                  This key will be scoped to <span className="font-medium">{lockedProject.name}</span>.
                </p>
              ) : null}
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
                disabled={pending || !canCreateApiKeys}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mint-role">Role</Label>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as ApiKeyRole)}
                disabled={pending || !canCreateApiKeys}
              >
                <SelectTrigger id="mint-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {API_KEY_ROLE_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className={ROLE_OPTION_STYLES[option.value]}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!canCreateApiKeys ? (
              <div className="text-sm text-muted-foreground">
                Only project owners can mint API keys and assign roles.
              </div>
            ) : null}
            {error ? <div className="text-sm text-destructive">{error}</div> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !canCreateApiKeys}>
                {pending ? "Minting..." : "Mint key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
