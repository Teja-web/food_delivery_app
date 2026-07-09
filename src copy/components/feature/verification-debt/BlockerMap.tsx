import Link from "next/link";
import { AlertTriangle, Clock, ShieldAlert, ExternalLink } from "lucide-react";

/**
 * BlockerMap — list of actionable blockers preventing a Plan / PR from
 * moving forward. Each row names the blocker and offers a concrete next
 * step. Three kinds, mapped from verification-debt sources:
 *
 *  - gate-failure → deep-link to upstream CI (coznt never reruns CI)
 *  - open-approval → request via source-of-record comment (M-D writeback)
 *  - rule-violation → edit Plan in coznt to remove the violation
 *
 * Pattern reference: tanznt `TriageItem.tsx` + `nudge-tray.tsx`.
 */

export type Blocker =
  | {
      kind: "gate-failure";
      gateName: string;
      gateType: string;
      ciRerunUrl?: string;
      message: string;
    }
  | {
      kind: "open-approval";
      approvalId: string;
      approverName?: string;
      requestedAt: Date;
      sourceOfRecordUrl?: string;
      message: string;
    }
  | {
      kind: "rule-violation";
      ruleName: string;
      planId: string;
      planEditUrl: string;
      message: string;
    };

export function BlockerMap({
  blockers,
  className,
}: {
  blockers: Blocker[];
  className?: string;
}) {
  if (blockers.length === 0) {
    return (
      <div className={`rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground ${className ?? ""}`}>
        Nothing blocking — clear to merge.
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-border bg-card ${className ?? ""}`}>
      <header className="px-4 py-3 border-b border-border">
        <h3 className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
          {blockers.length} {blockers.length === 1 ? "blocker" : "blockers"} between you and merge
        </h3>
      </header>
      <ul className="divide-y divide-border">
        {blockers.map((b, i) => (
          <li key={i}>
            <BlockerRow blocker={b} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlockerRow({ blocker }: { blocker: Blocker }) {
  switch (blocker.kind) {
    case "gate-failure":
      return (
        <div className="px-4 py-3 flex items-start gap-3">
          <ShieldAlert className="h-4 w-4 mt-0.5 text-rose-600 shrink-0" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{blocker.gateName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{blocker.message}</p>
          </div>
          {blocker.ciRerunUrl ? (
            <Link
              href={blocker.ciRerunUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-foreground hover:underline inline-flex items-center gap-1 shrink-0"
            >
              Rerun in CI <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground shrink-0">No CI link</span>
          )}
        </div>
      );

    case "open-approval": {
      const ageHours = Math.max(0, Math.round((Date.now() - blocker.requestedAt.getTime()) / 3600000));
      return (
        <div className="px-4 py-3 flex items-start gap-3">
          <Clock className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Waiting on {blocker.approverName ?? "approval"} · {ageHours}h
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{blocker.message}</p>
          </div>
          {blocker.sourceOfRecordUrl ? (
            <Link
              href={blocker.sourceOfRecordUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-foreground hover:underline inline-flex items-center gap-1 shrink-0"
            >
              Request <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          ) : (
            <span
              className="text-xs text-muted-foreground shrink-0"
              title="Source-of-record comment writeback ships at M-D"
            >
              Request — M-D
            </span>
          )}
        </div>
      );
    }

    case "rule-violation":
      return (
        <div className="px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-rose-600 shrink-0" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Rule violation: <span className="font-mono">{blocker.ruleName}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{blocker.message}</p>
          </div>
          <Link
            href={blocker.planEditUrl}
            className="text-xs text-foreground hover:underline shrink-0"
          >
            Edit Plan
          </Link>
        </div>
      );
  }
}
