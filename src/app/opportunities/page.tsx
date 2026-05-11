import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { listPublicOpportunities } from "@/operations/public";
import {
  INDUSTRY_VALUES,
  REGION_VALUES,
  STAGE_VALUES,
  type Industry,
  type Region,
  type Stage,
} from "@/lib/anonymize/taxonomy";
import { appBaseUrl } from "@/lib/anonymize/seo";
import { OpportunityCard } from "./OpportunityCard";
import { OpportunityFilters } from "./OpportunityFilters";

export const metadata: Metadata = {
  title: "Opportunities — Dilliznt",
  description: "Real, live roles from companies hiring now. Browse anonymized listings; sign up to apply.",
  alternates: { canonical: `${appBaseUrl()}/opportunities` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Opportunities",
    description: "Real, live roles from companies hiring now.",
    url: `${appBaseUrl()}/opportunities`,
    type: "website",
  },
};

interface PageProps {
  searchParams: Promise<{
    q?: string;
    region?: string;
    industry?: string;
    stage?: string;
    offset?: string;
    limit?: string;
  }>;
}

const PAGE_SIZE = 25;

export default async function OpportunitiesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const q = params.q?.trim() || undefined;
  const region = parseEnum(params.region, REGION_VALUES);
  const industry = parseEnum(params.industry, INDUSTRY_VALUES);
  const stage = parseEnum(params.stage, STAGE_VALUES);
  const offset = parseIntSafe(params.offset, 0);
  const limit = parseIntSafe(params.limit, PAGE_SIZE);

  const result = await listPublicOpportunities({
    q,
    region: region as Region[] | undefined,
    industry: industry as Industry[] | undefined,
    stage: stage as Stage[] | undefined,
    offset,
    limit,
  });

  const showingFrom = result.total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + result.items.length, result.total);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[280px,1fr]">
      {/* Filters sidebar */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <h1 className="mb-1 font-display text-2xl font-bold tracking-tight text-foreground">
          Opportunities
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Real, live roles. Org names are redacted by default.
        </p>
        <OpportunityFilters
          initial={{
            q,
            region: region as string[] | undefined,
            industry: industry as string[] | undefined,
            stage: stage as string[] | undefined,
          }}
        />
      </aside>

      {/* Results */}
      <section>
        <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
          <p>
            {result.total === 0
              ? "No matches"
              : `${showingFrom}–${showingTo} of ${result.total}`}
          </p>
        </div>

        {result.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-card/50 p-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-semibold text-foreground">
              Nothing matches your filters
            </p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Try removing a filter or broadening your search.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {result.items.map((dto) => (
              <OpportunityCard key={dto.slug} dto={dto} />
            ))}
          </div>
        )}

        {result.total > limit && (
          <Pagination
            offset={offset}
            limit={limit}
            total={result.total}
            params={params}
          />
        )}
      </section>
    </div>
  );
}

function Pagination({
  offset,
  limit,
  total,
  params,
}: {
  offset: number;
  limit: number;
  total: number;
  params: Record<string, string | undefined>;
}) {
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasPrev = offset > 0;
  const hasNext = nextOffset < total;

  function makeUrl(o: number): string {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v && k !== "offset") next.set(k, v);
    }
    if (o > 0) next.set("offset", String(o));
    const qs = next.toString();
    return qs ? `/opportunities?${qs}` : "/opportunities";
  }

  return (
    <div className="mt-8 flex items-center justify-center gap-3">
      <PageLink href={makeUrl(prevOffset)} disabled={!hasPrev} direction="prev" />
      <span className="text-xs text-muted-foreground">
        Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)}
      </span>
      <PageLink href={makeUrl(nextOffset)} disabled={!hasNext} direction="next" />
    </div>
  );
}

function PageLink({
  href,
  disabled,
  direction,
}: {
  href: string;
  disabled: boolean;
  direction: "prev" | "next";
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const className =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-amber-200 hover:text-foreground";

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={`${className} cursor-not-allowed opacity-40`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <Link href={href} className={className}>
      <Icon className="h-3.5 w-3.5" />
    </Link>
  );
}

function parseEnum(raw: string | undefined, allowed: readonly string[]): string[] | undefined {
  if (!raw) return undefined;
  const split = raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => allowed.includes(v));
  return split.length > 0 ? split : undefined;
}

function parseIntSafe(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
