"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import { createAutonomyThresholdRule } from "@/actions/rules";

type ActionKind = "merge_pr" | "co_sign_promotion" | "deploy_production" | "*";
type ChangeRisk = "low" | "medium" | "high" | "critical" | "*";
type Autonomy = "observe" | "propose" | "merge" | "lead";
type Severity = "info" | "warn" | "error";

const ACTION_LABEL: Record<ActionKind, string> = {
  merge_pr: "Merge PR",
  co_sign_promotion: "Co-sign promotion",
  deploy_production: "Deploy to production",
  "*": "Any action (*)",
};

const RISK_LABEL: Record<ChangeRisk, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
  "*": "Any risk (*)",
};

const AUTONOMY_LABEL: Record<Autonomy, string> = {
  observe: "Observe (0)",
  propose: "Propose (1)",
  merge: "Merge (2)",
  lead: "Lead (3)",
};

export function AutonomyThresholdDialog({
  projects,
}: {
  projects: { id: string; name: string; slug: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<"org" | "project">("org");
  const [projectId, setProjectId] = useState<string>("");
  const [actionKind, setActionKind] = useState<ActionKind>("merge_pr");
  const [changeRisk, setChangeRisk] = useState<ChangeRisk>("medium");
  const [minAutonomy, setMinAutonomy] = useState<Autonomy>("merge");
  const [severity, setSeverity] = useState<Severity>("warn");

  const canSubmit =
    title.trim().length > 0 && (scope === "org" || projectId.length > 0) && !pending;

  function reset() {
    setTitle("");
    setScope("org");
    setProjectId("");
    setActionKind("merge_pr");
    setChangeRisk("medium");
    setMinAutonomy("merge");
    setSeverity("warn");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    startTransition(async () => {
      try {
        await createAutonomyThresholdRule({
          title: title.trim(),
          projectId: scope === "org" ? null : projectId,
          actionKind,
          changeRisk,
          minAutonomy,
          severity,
        });
        toast.success("Autonomy-threshold rule created.");
        setOpen(false);
        reset();
        router.refresh();
      } catch (err) {
        toast.error(`Failed to create rule: ${(err as Error).message}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> New autonomy-threshold rule
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>New autonomy-threshold rule</DialogTitle>
            <DialogDescription>
              Require a minimum autonomy level for a (action, change-risk) tuple. Project-scoped
              rules override org-wide rules. The execution gate consults this policy on every PR.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="atr-title">Title</Label>
              <Input
                id="atr-title"
                placeholder="e.g. Require Lead for payments merges"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Scope</Label>
                <Select value={scope} onValueChange={(v) => setScope(v as "org" | "project")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org">Org-wide</SelectItem>
                    <SelectItem value="project">Specific project</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Select
                  value={projectId}
                  onValueChange={setProjectId}
                  disabled={scope === "org"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={scope === "org" ? "n/a" : "Pick a project"} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Action kind</Label>
                <Select value={actionKind} onValueChange={(v) => setActionKind(v as ActionKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ACTION_LABEL) as ActionKind[]).map((a) => (
                      <SelectItem key={a} value={a}>
                        {ACTION_LABEL[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Change risk</Label>
                <Select value={changeRisk} onValueChange={(v) => setChangeRisk(v as ChangeRisk)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(RISK_LABEL) as ChangeRisk[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {RISK_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Min autonomy</Label>
                <Select value={minAutonomy} onValueChange={(v) => setMinAutonomy(v as Autonomy)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(AUTONOMY_LABEL) as Autonomy[]).map((a) => (
                      <SelectItem key={a} value={a}>
                        {AUTONOMY_LABEL[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">info</SelectItem>
                    <SelectItem value="warn">warn</SelectItem>
                    <SelectItem value="error">error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
              <span className="font-mono">
                {actionKind} @ {changeRisk}
              </span>{" "}
              requires <span className="font-mono font-medium text-foreground">{minAutonomy}</span>{" "}
              · {scope === "org" ? "org-wide" : "project-scoped"} · {severity} severity
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {pending ? "Saving…" : "Create rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
