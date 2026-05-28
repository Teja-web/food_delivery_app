import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function PageMeta({
  label,
  qualifier,
  link,
}: {
  label: string;
  qualifier?: string;
  link?: { href: string; text: string };
}) {
  return (
    <div className="anim-fade-up flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
      <span className="flex items-center gap-2">
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        </span>
        {label}
      </span>
      {qualifier && <span className="hidden md:inline">{qualifier}</span>}
      {link && (
        <Link
          href={link.href}
          className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
        >
          {link.text} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
