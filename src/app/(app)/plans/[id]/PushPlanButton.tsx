"use client";

import { GitPullRequest, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { pushProjectTaskToRepo } from "@/actions/plan/plans";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  planId: string;
  repositories: Array<{
    identifier: string;
    defaultBranch: string | null;
  }>;
  initialDirectoryName: string;
  initialFileName: string;
  initialBranchName: string;
  initialRepositoryIdentifier: string;
};

export function PushPlanButton({
  planId,
  repositories,
  initialDirectoryName,
  initialFileName,
  initialBranchName,
  initialRepositoryIdentifier,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [repositoryIdentifier, setRepositoryIdentifier] = useState(initialRepositoryIdentifier);
  const [baseBranch, setBaseBranch] = useState(
    repositories.find((repo) => repo.identifier === initialRepositoryIdentifier)?.defaultBranch || "main",
  );
  const [branchName, setBranchName] = useState(`${initialBranchName}-${Date.now()}`);
  const [directoryName, setDirectoryName] = useState(initialDirectoryName);
  const [fileName, setFileName] = useState(initialFileName);

  const selectedRepository = useMemo(
    () => repositories.find((repo) => repo.identifier === repositoryIdentifier) ?? repositories[0],
    [repositories, repositoryIdentifier],
  );

  function applyRepoDefaults(identifier: string) {
    const repo = repositories.find((item) => item.identifier === identifier);
    setRepositoryIdentifier(identifier);
    setBaseBranch(repo?.defaultBranch || "main");
  }

  function validateBeforePush() {
    if (!repositoryIdentifier.trim()) return "Repository is required.";
    if (!baseBranch.trim()) return "Base branch is required.";
    if (!branchName.trim()) return "Head branch is required.";
    if (!directoryName.trim()) return "Directory path is required.";
    if (!fileName.trim()) return "File name is required.";
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={isPending}>
          <GitPullRequest className="h-3.5 w-3.5" aria-hidden /> Push
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Push Plan To GitHub</DialogTitle>
          <DialogDescription>Set repo and branch details, then open a PR with this plan file.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid gap-2">
            <Label htmlFor="push-repo">Repository</Label>
            <Select value={repositoryIdentifier} onValueChange={applyRepoDefaults}>
              <SelectTrigger id="push-repo">
                <SelectValue placeholder="Choose repository" />
              </SelectTrigger>
              <SelectContent>
                {repositories.map((repo) => (
                  <SelectItem key={repo.identifier} value={repo.identifier}>
                    {repo.identifier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="push-base-branch">Base branch</Label>
            <Input id="push-base-branch" value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="push-head-branch">Head branch</Label>
            <Input id="push-head-branch" value={branchName} onChange={(e) => setBranchName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="push-directory">Directory path</Label>
            <Input id="push-directory" value={directoryName} onChange={(e) => setDirectoryName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="push-filename">File name</Label>
            <Input id="push-filename" value={fileName} onChange={(e) => setFileName(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Selected repo default branch: {selectedRepository?.defaultBranch || "main"}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const validationError = validateBeforePush();
                if (validationError) {
                  toast.error(validationError);
                  return;
                }

                try {
                  const result = await pushProjectTaskToRepo({
                    planId,
                    directoryName,
                    fileName,
                    branchName,
                    baseBranch,
                    repositoryIdentifier,
                  });
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Plan pushed successfully.");
                  setOpen(false);
                  window.open(result.prUrl, "_blank", "noopener,noreferrer");
                  router.refresh();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to push plan.");
                }
              })
            }
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Pushing
              </>
            ) : (
              <>
                <GitPullRequest className="h-3.5 w-3.5" aria-hidden /> Push and Open PR
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
