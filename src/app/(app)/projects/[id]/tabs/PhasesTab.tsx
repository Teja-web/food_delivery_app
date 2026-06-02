"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { createGate, deleteGate, setGateStatus, updateGate } from "@/actions/gate/phase-gates";

import type { CockpitClient as CockpitData, CockpitGateClient } from "../serialize";

type GateStatus = CockpitGateClient["status"];
type GateType = CockpitGateClient["type"];
type ProjectPhase = CockpitData["project"]["phase"];

const PHASE_ORDER: ProjectPhase[] = [
  "requirements",
  "design",
  "development",
  "testing",
  "cicd",
  "monitoring",
];

const GATE_TYPE_OPTIONS: Array<{ value: GateType; label: string; helper: string }> = [
  { value: "approval", label: "Approval", helper: "Cleared by a human approval record." },
  { value: "coverage", label: "Coverage", helper: "Most recent TEST_COVERAGE metric ≥ threshold." },
  { value: "lint", label: "Lint", helper: "Most recent CI lint run succeeded." },
  { value: "security", label: "Security", helper: "Most recent security scan reported no blockers." },
  { value: "custom", label: "Custom", helper: "Status set manually or by a custom task." },
];

const STATUS_OPTIONS: Array<{ value: GateStatus; label: string }> = [
  { value: "passed", label: "Mark passed" },
  { value: "skipped", label: "Mark skipped" },
  { value: "failed", label: "Mark failed" },
  { value: "pending", label: "Reset to pending" },
];

function StatusDot({ status }: { status: GateStatus }) {
  const map: Record<GateStatus, React.ReactElement> = {
    passed: <CircleCheck className="h-3.5 w-3.5 text-state-passed" />,
    failed: <CircleX className="h-3.5 w-3.5 text-state-failed" />,
    pending: <CircleDashed className="h-3.5 w-3.5 text-state-pending" />,
    skipped: <CircleAlert className="h-3.5 w-3.5 text-muted-foreground/60" />,
  };
  return map[status];
}

interface DialogState {
  open: boolean;
  mode: "create" | "edit";
  phase: ProjectPhase;
  gate: CockpitGateClient | null;
}

const CLOSED: DialogState = { open: false, mode: "create", phase: "requirements", gate: null };

export function PhasesTab({ data }: { data: CockpitData }) {
  const { project, gatesByPhase } = data;
  const currentIdx = PHASE_ORDER.indexOf(project.phase);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(CLOSED);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function onStatusChange(gateId: string, status: GateStatus) {
    try {
      await setGateStatus(gateId, status);
      toast.success(`Gate ${status}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update gate");
    }
  }

  async function onDelete(gate: CockpitGateClient) {
    if (!confirm(`Delete gate "${gate.name}"?`)) return;
    try {
      await deleteGate(gate.id);
      toast.success("Gate deleted");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete gate");
    }
  }

  return (
    <div className="space-y-6">
      {/* Linear progress strip */}
      <Card>
        <CardContent className="px-6 py-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Pipeline progression
          </div>
          <ol className="mt-4 grid grid-cols-6 gap-1">
            {gatesByPhase.map((g, idx) => {
              const isCurrent = idx === currentIdx;
              const isPast = idx < currentIdx;
              const isFuture = idx > currentIdx;
              const cleared = g.gates.filter(
                (x) => x.status === "passed" || x.status === "skipped",
              ).length;
              const total = g.gates.length;

              return (
                <li key={g.phase} className="flex flex-col gap-1.5">
                  <div
                    className={cn(
                      "h-1.5 rounded-full",
                      isPast && "bg-state-passed",
                      isCurrent && "bg-primary",
                      isFuture && "bg-border",
                    )}
                  />
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        "font-mono text-[10px] uppercase tracking-wide",
                        isPast && "text-state-passed",
                        isCurrent && "text-foreground font-semibold",
                        isFuture && "text-muted-foreground/60",
                      )}
                    >
                      {g.label}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/70">
                      {total > 0 ? `${cleared}/${total}` : "—"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {/* Per-phase gates */}
      <div className="space-y-4">
        {gatesByPhase.map((g, idx) => {
          const isCurrent = idx === currentIdx;
          const isPast = idx < currentIdx;
          return (
            <Card
              key={g.phase}
              className={cn("border", isCurrent && "border-primary/40 bg-card/60", isPast && "opacity-80")}
            >
              <CardContent className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-semibold">{g.label}</span>
                    {isCurrent && (
                      <Badge
                        variant="outline"
                        className="border-primary/40 px-1.5 py-0 font-mono text-[10px] uppercase text-primary"
                      >
                        Current
                      </Badge>
                    )}
                    {isPast && (
                      <Badge
                        variant="outline"
                        className="border-state-passed/40 px-1.5 py-0 font-mono text-[10px] uppercase text-state-passed"
                      >
                        Completed
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
                      {g.gates.length} {g.gates.length === 1 ? "gate" : "gates"}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-xs"
                      onClick={() =>
                        setDialog({ open: true, mode: "create", phase: g.phase, gate: null })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add gate
                    </Button>
                  </div>
                </div>
                {g.gates.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No gates configured — advancement from this phase is unrestricted.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1.5">
                    {g.gates.map((gate) => (
                      <li
                        key={gate.id}
                        className="flex items-start gap-2.5 rounded-md px-1.5 py-1 text-sm hover:bg-muted/40"
                      >
                        <StatusDot status={gate.status} />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{gate.name}</span>{" "}
                          <Badge variant="outline" className="ml-1 px-1.5 py-0 font-mono text-[10px] uppercase">
                            {gate.type}
                          </Badge>
                          {gate.type === "coverage" && gate.threshold != null ? (
                            <Badge variant="outline" className="ml-1 px-1.5 py-0 font-mono text-[10px]">
                              ≥ {gate.threshold}
                            </Badge>
                          ) : null}
                          {gate.pendingApprovalCount > 0 && gate.status === "pending" ? (
                            <Badge
                              variant="outline"
                              className="ml-1 border-state-pending/40 px-1.5 py-0 font-mono text-[10px] uppercase text-state-pending"
                            >
                              In review
                              {gate.pendingApprovalCount > 1
                                ? ` · ${gate.pendingApprovalCount}`
                                : ""}
                            </Badge>
                          ) : null}
                          {gate.description ? (
                            <div className="mt-0.5 text-xs text-muted-foreground">{gate.description}</div>
                          ) : null}
                          {gate.unmetCriterion && (gate.status === "pending" || gate.status === "failed") ? (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {gate.unmetCriterion}
                              {gate.assigneeName ? (
                                <span className="ml-1 text-foreground/80">@{gate.assigneeName}</span>
                              ) : null}
                              {gate.ageLabel ? <span className="ml-1 opacity-70">({gate.ageLabel})</span> : null}
                            </div>
                          ) : null}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground"
                              aria-label={`Gate actions for ${gate.name}`}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onSelect={() =>
                                setDialog({ open: true, mode: "edit", phase: g.phase, gate })
                              }
                            >
                              Edit gate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
                              Status
                            </DropdownMenuLabel>
                            {STATUS_OPTIONS.map((opt) => (
                              <DropdownMenuItem
                                key={opt.value}
                                disabled={opt.value === gate.status}
                                onSelect={() => onStatusChange(gate.id, opt.value)}
                              >
                                {opt.label}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => onDelete(gate)}
                              className="text-state-failed focus:text-state-failed"
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Delete gate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <GateDialog
        state={dialog}
        projectId={project.id}
        onClose={() => setDialog(CLOSED)}
        onSaved={() => {
          setDialog(CLOSED);
          refresh();
        }}
      />
    </div>
  );
}

function GateDialog({
  state,
  projectId,
  onClose,
  onSaved,
}: {
  state: DialogState;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = state.mode === "edit" && state.gate !== null;
  const [name, setName] = useState(editing ? state.gate!.name : "");
  const [description, setDescription] = useState(editing ? state.gate!.description ?? "" : "");
  const [type, setType] = useState<GateType>(editing ? state.gate!.type : "approval");
  const [threshold, setThreshold] = useState<string>(
    editing && state.gate!.threshold != null ? String(state.gate!.threshold) : "",
  );
  const [saving, setSaving] = useState(false);

  // Re-seed inputs whenever the dialog opens for a different gate.
  const formKey = `${state.mode}:${state.gate?.id ?? state.phase}`;
  const [lastKey, setLastKey] = useState(formKey);
  if (state.open && lastKey !== formKey) {
    setLastKey(formKey);
    setName(editing ? state.gate!.name : "");
    setDescription(editing ? state.gate!.description ?? "" : "");
    setType(editing ? state.gate!.type : "approval");
    setThreshold(editing && state.gate!.threshold != null ? String(state.gate!.threshold) : "");
  }

  async function onSubmit() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const thresholdNum = threshold.trim() === "" ? undefined : Number(threshold);
      if (thresholdNum != null && Number.isNaN(thresholdNum)) {
        toast.error("Threshold must be a number");
        setSaving(false);
        return;
      }
      if (editing) {
        await updateGate(state.gate!.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          type,
          threshold: thresholdNum,
        });
        toast.success("Gate updated");
      } else {
        await createGate({
          projectId,
          phase: state.phase,
          name: name.trim(),
          description: description.trim() || undefined,
          type,
          threshold: thresholdNum,
        });
        toast.success("Gate created");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save gate");
    } finally {
      setSaving(false);
    }
  }

  const typeOpt = GATE_TYPE_OPTIONS.find((o) => o.value === type);

  return (
    <Dialog open={state.open} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit gate" : "Add gate"}</DialogTitle>
          <DialogDescription>
            {editing ? (
              "Update the checkpoint that must clear for this phase to advance."
            ) : (
              <>Add a checkpoint for the <span className="font-mono">{state.phase}</span> phase.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="gate-name">Name</Label>
            <Input
              id="gate-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Requirements approved"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gate-description">Description</Label>
            <Textarea
              id="gate-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What needs to be true for this gate to clear?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gate-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as GateType)}>
              <SelectTrigger id="gate-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GATE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {typeOpt ? (
              <p className="text-[11px] text-muted-foreground">{typeOpt.helper}</p>
            ) : null}
          </div>
          {type === "coverage" && (
            <div className="space-y-1.5">
              <Label htmlFor="gate-threshold">Threshold (%)</Label>
              <Input
                id="gate-threshold"
                inputMode="numeric"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder="80"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add gate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
