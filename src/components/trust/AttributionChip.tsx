import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  href?: string;
  className?: string;
  title?: string;
};

export function AttributionChip({ id, href, className, title }: Props) {
  const content = (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 px-1.5 py-0 font-mono text-[10px] font-normal text-muted-foreground hover:text-foreground",
        className,
      )}
      title={title}
    >
      {id}
      {href ? <ExternalLink className="h-2.5 w-2.5" aria-hidden /> : null}
    </Badge>
  );

  if (!href) return content;
  return (
    <Link href={href} target="_blank" rel="noreferrer" className="inline-flex">
      {content}
    </Link>
  );
}
