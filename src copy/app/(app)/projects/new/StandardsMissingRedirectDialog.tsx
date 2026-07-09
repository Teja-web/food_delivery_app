"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function StandardsMissingRedirectDialog() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timeout = window.setTimeout(() => {
      router.replace("/settings/standards");
    }, 1400);
    return () => window.clearTimeout(timeout);
  }, [router]);

  if (!mounted) return null;

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-[12px] bg-amber-50 text-amber-700">
            <AlertCircle className="h-5 w-5" aria-hidden />
          </div>
          <DialogTitle>Organization standards are not set</DialogTitle>
          <DialogDescription>
            Create the required Coding Standards, Brand Guidelines, and Architecture Principles before starting a new project.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Redirecting
          </div>
          <Button type="button" onClick={() => router.replace("/settings/standards")}>
            Open standards
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
