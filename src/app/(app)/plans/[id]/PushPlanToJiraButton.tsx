"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { pushPlanToJiraAction } from "@/actions/integration/jira-sync";
import { Button } from "@/components/ui/button";

export function PushPlanToJiraButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            const result = await pushPlanToJiraAction(planId);
            if (!result) {
              toast.error("No Jira binding configured for this plan.");
              return;
            }
            toast.success(`Pushed to Jira ${result.key}`);
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Jira push failed");
          }
        });
      }}
    >
      {pending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
      )}
      Push to Jira
    </Button>
  );
}
