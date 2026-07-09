"use client";

/**
 * UndoToast — reusable undo affordance for destructive writes.
 *
 * Used by:
 *   - Bulk reject / dismiss / hold (Phase 2)
 *   - Bulk add note (Phase 2)
 *   - Single-row destructive stage transitions in the right-pane action bar
 *
 * Stack semantics: only one toast is shown at a time. If a new toast
 * mounts, the existing one's countdown stops; the parent component is
 * responsible for unmounting/remounting to switch toasts (e.g. by
 * keying the toast on the action's id).
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export type UndoToastProps = {
  message: string;
  /** Optional. When omitted, the Undo button isn't rendered — useful for
   *  non-destructive bulk ops (e.g. add-to-pipeline) that want to surface
   *  message + skipped count without offering a reversal. */
  onUndo?: () => void | Promise<void>;
  /** Toast lifetime in ms before auto-dismiss. Default 8000. */
  durationMs?: number;
  /** Called when the toast auto-dismisses without the user clicking Undo. */
  onExpire?: () => void;
  /** Called when the user clicks Undo and the reversal completes. */
  onUndone?: () => void;
  /** Optional skipped-row details shown as "N skipped" with hover tooltip. */
  skipped?: { id: string; reason: string }[];
};

export function UndoToast(props: UndoToastProps) {
  const duration = props.durationMs ?? 8000;
  const [remainingMs, setRemainingMs] = useState(duration);
  const [state, setState] = useState<"active" | "undoing" | "done" | "expired">("active");
  const startedAt = useRef(Date.now());

  // Countdown tick — once per second while active.
  useEffect(() => {
    if (state !== "active") return;
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      const remaining = Math.max(0, duration - elapsed);
      setRemainingMs(remaining);
      if (remaining <= 0) {
        clearInterval(tick);
        setState("expired");
        props.onExpire?.();
      }
    }, 250);
    return () => clearInterval(tick);
  }, [state, duration, props]);

  // ESC dismisses without undoing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state === "active") {
        setState("expired");
        props.onExpire?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, props]);

  if (state === "expired") return null;

  const handleUndo = async () => {
    if (state !== "active" || !props.onUndo) return;
    setState("undoing");
    try {
      await props.onUndo();
      setState("done");
      props.onUndone?.();
      // Auto-dismiss the success state after 1.5s.
      setTimeout(() => setState("expired"), 1500);
    } catch (err) {
      console.error("[UndoToast] undo failed", err);
      setState("active");
      startedAt.current = Date.now(); // reset countdown so user can retry
    }
  };

  const remainingSecs = Math.ceil(remainingMs / 1000);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
    >
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-lg shadow-lg text-sm",
          state === "done"
            ? "bg-emerald-600 text-white"
            : "bg-foreground text-background",
        )}
      >
        {state === "done" ? (
          <>
            <RotateCcw className="h-4 w-4" />
            <span>Restored</span>
          </>
        ) : state === "undoing" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Undoing…</span>
          </>
        ) : (
          <>
            <RotateCcw className="h-4 w-4" />
            <span>{props.message}</span>
            {props.skipped && props.skipped.length > 0 && (
              <span
                className="text-background/70 cursor-help"
                title={props.skipped.map((s) => s.reason).join("\n")}
              >
                · {props.skipped.length} skipped
              </span>
            )}
            {props.onUndo && (
              <button
                onClick={handleUndo}
                className="font-medium underline underline-offset-2 hover:no-underline"
              >
                Undo
              </button>
            )}
            <span className="text-background/40 ml-2 tabular-nums">{remainingSecs}s</span>
          </>
        )}
      </div>
    </div>
  );
}
