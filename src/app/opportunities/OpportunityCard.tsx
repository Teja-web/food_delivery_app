import Link from "next/link";
import { ArrowRight, Briefcase, MapPin } from "lucide-react";
import type { PublicRoleDTO } from "@/lib/anonymize";
import { formatPublicComp, formatRelativeDate } from "@/lib/anonymize/format";
import { REGION_LABELS_CARD } from "@/lib/anonymize/taxonomy";

export function OpportunityCard({ dto }: { dto: PublicRoleDTO }) {
  const compBand = formatPublicComp(dto);
  const label =
    dto.visibility === "anonymized"
      ? dto.publicLabel
      : dto.orgName ?? "Open role";
  const region =
    dto.visibility === "anonymized"
      ? REGION_LABELS_CARD[dto.region]
      : dto.location ?? null;

  return (
    <Link
      href={`/opportunities/${dto.slug}`}
      className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-amber-200 hover:bg-amber-50/10"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">
        {label}
      </p>
      <h3 className="mt-2 font-display text-base font-semibold text-foreground">
        {dto.title}
      </h3>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {region && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {region}
          </span>
        )}
        {dto.employmentType && (
          <span className="inline-flex items-center gap-1">
            <Briefcase className="h-3 w-3" /> {humanizeEmploymentType(dto.employmentType)}
          </span>
        )}
      </div>

      {compBand && (
        <p className="mt-2 text-sm font-medium text-foreground">{compBand}</p>
      )}

      {dto.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {dto.skills.slice(0, 5).map((s) => (
            <span
              key={s}
              className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between pt-4 text-xs">
        <span className="text-muted-foreground">
          {formatRelativeDate(dto.postedAt, "short")}
        </span>
        <span className="inline-flex items-center gap-1 font-medium text-amber-700 transition-transform group-hover:translate-x-0.5">
          View <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

function humanizeEmploymentType(type: string): string {
  return type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
