import Link from "next/link";
import { ExternalLink } from "lucide-react";

/**
 * Universal "open in source-of-record" affordance.
 *
 * Drop this on any entity row that mirrors external state (work_items,
 * plans bound to tickets, releases bound to deployments). One icon,
 * one tooltip, one keyboard target — consistent across coznt.
 *
 * Coznt is the *overlay*, not the system of record. This component is
 * the user's escape hatch to where the truth actually lives.
 */
export function SourceLink({
  href,
  label,
  className,
}: {
  /** External URL. Null/undefined → component renders nothing. */
  href: string | null | undefined;
  /** Accessible label, e.g. "Open in GitHub" or "View Linear issue". */
  label: string;
  className?: string;
}) {
  if (!href) return null;
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className={`inline-flex items-center text-muted-foreground hover:text-foreground transition-colors ${className ?? ""}`}
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}
