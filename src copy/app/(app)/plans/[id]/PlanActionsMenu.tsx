"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Loader2, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deletePlan } from "@/actions/plan/plans";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  planId: string;
  projectId: string;
  body: string;
  bodyHtml: string;
}

export function PlanActionsMenu({ planId, projectId, body, bodyHtml }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const handleCopy = async (text: string, format: "Markdown" | "HTML") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${format} to clipboard`);
    } catch (err) {
      toast.error(`Failed to copy: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deletePlan(planId);
        toast.success("Plan deleted successfully");
        setShowDeleteDialog(false);
        router.push(`/projects/${projectId}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete plan");
      }
    });
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Plan Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <a
              href={`/api/v1/plans/${planId}/export?format=md`}
              className="flex w-full items-center gap-2"
            >
              <Download className="h-4 w-4 text-muted-foreground" />
              <span>Export .md</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={`/api/v1/plans/${planId}/export?format=html`}
              className="flex w-full items-center gap-2"
            >
              <Download className="h-4 w-4 text-muted-foreground" />
              <span>Export .html</span>
            </a>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => handleCopy(body, "Markdown")}>
            <Copy className="h-4 w-4 text-muted-foreground" />
            <span>Copy .md</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleCopy(bodyHtml, "HTML")}>
            <Copy className="h-4 w-4 text-muted-foreground" />
            <span>Copy .html</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => {
              setMenuOpen(false);
              setTimeout(() => setShowDeleteDialog(true), 100);
            }}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive dark:focus:bg-destructive/20"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this plan? This action cannot be undone and will permanently remove all associated revisions and data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleDelete}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
