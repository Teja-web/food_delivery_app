"use client";

import { useState, useTransition, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AskAIButton } from "@/components/shared/ask-ai-button";
import { Pagination } from "@/components/shared/pagination";
import { useEntityEvent } from "@/hooks/use-entity-event";
import { listPools, getPoolNewMemberCounts } from "@/actions/pools";
import { listRoles } from "@/actions/roles";
import { serializePoolsList, buildRoleMap } from "./serialize";
import type { SerializedPool, PoolsPageProps } from "./serialize";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 25;

function poolHealthColor(health: string) {
  switch (health) {
    case "active":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "growing":
      return "text-blue-700 bg-blue-50 border-blue-200";
    case "stale":
      return "text-amber-700 bg-amber-50 border-amber-200";
    default:
      return "text-muted-foreground bg-secondary border-border";
  }
}

function poolHealthLabel(health: string) {
  switch (health) {
    case "active":
      return "Active";
    case "growing":
      return "Growing";
    case "stale":
      return "Stale";
    default:
      return health;
  }
}

export default function PoolsClient({ pools: initialPools, total: initialTotal }: PoolsPageProps) {
  const [pools, setPools] = useState(initialPools);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRef = useRef(page);
  pageRef.current = page;

  const fetchPage = useCallback((p: number) => {
    startTransition(async () => {
      const offset = (p - 1) * PAGE_SIZE;
      const [poolsResult, rolesResult, newMembersMap] = await Promise.all([
        listPools({ offset, limit: PAGE_SIZE }),
        listRoles(),
        getPoolNewMemberCounts(),  // org-scoped by action context
      ]);
      const roleMap = buildRoleMap(rolesResult?.items ?? []);
      const serialized = serializePoolsList(poolsResult?.items ?? [], roleMap, newMembersMap);
      setPools(serialized);
      setTotal(poolsResult?.total ?? 0);
    });
  }, []);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    fetchPage(p);
  }, [fetchPage]);

  useEntityEvent(["pool", "poolMember"], undefined, () => {
    fetchPage(pageRef.current);
  });

  const totalCandidates = pools.reduce((sum, p) => sum + p.candidateCount, 0);

  const filtered = pools.filter(
    (p) =>
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Talent Pools
                </span>
              </div>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
                {total} pools, {totalCandidates} candidates
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Pools continuously feed candidates into open role pipelines via
                the Recommended tab.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <AskAIButton entity="pool" view="list" />
              <Link
                href="/recruit/pools/new"
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-3 w-3" />
                New pool
              </Link>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search pools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[8px]">
                ✦
              </div>
              <p className="text-xs font-semibold text-foreground">
                How pools work
              </p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Pools are candidate segments that the platform continuously
              matches against open roles. When a role opens, the system scores
              pool members against the role&apos;s criteria and surfaces matches
              on the role&apos;s Recommended tab.
            </p>
          </div>

          <div className={cn("space-y-4", isPending && "opacity-60 transition-opacity")}>
            {filtered.map((pool) => (
              <PoolCard key={pool.id} pool={pool} />
            ))}
          </div>

          {!searchQuery && (
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} isPending={isPending} label="pools" onPageChange={handlePageChange} />
          )}

          {filtered.length === 0 && searchQuery && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-8 text-center">
              <Search className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs font-semibold text-foreground">
                No pools match &ldquo;{searchQuery}&rdquo;
              </p>
            </div>
          )}

          {pools.length === 0 && !searchQuery && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-8 text-center">
              <Users className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs font-semibold text-foreground">
                No talent pools yet
              </p>
              <p className="text-xs text-muted-foreground">
                Create your first pool to start organizing candidates.
              </p>
              <Link
                href="/recruit/pools/new"
                className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-3 w-3" />
                New pool
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PoolCard({ pool }: { pool: SerializedPool }) {
  const criteriaDisplay = pool.criteria
    ? [
        ...(pool.criteria.skills ?? []),
        ...(pool.criteria.tags ?? []),
        ...(pool.criteria.locations ?? []),
      ].slice(0, 5)
    : [];

  return (
    <Link
      href={`/recruit/pools/${pool.id}`}
      className="block rounded-2xl border border-border bg-card overflow-hidden transition-all hover:shadow-sm"
    >
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {pool.name}
              </h3>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  poolHealthColor(pool.health)
                )}
              >
                {poolHealthLabel(pool.health)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {pool.description}
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-center">
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {pool.candidateCount}
              </p>
              <p className="text-[10px] text-muted-foreground">Candidates</p>
            </div>
            <div className="text-center">
              <p
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  pool.newThisWeek > 0
                    ? "text-emerald-700"
                    : "text-muted-foreground"
                )}
              >
                +{pool.newThisWeek}
              </p>
              <p className="text-[10px] text-muted-foreground">This week</p>
            </div>
          </div>
        </div>

        {criteriaDisplay.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {criteriaDisplay.map((c) => (
              <span
                key={c}
                className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        )}

        {pool.matchingRoles.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-amber-500" />
            <span>Matching against: {pool.matchingRoles.join(", ")}</span>
          </div>
        )}
      </div>

      <div className="border-t border-border bg-secondary/30 px-5 py-3 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {pool.topSignal ?? "Analyzing pool..."}
        </p>
        <div className="flex items-center gap-3">
          {pool.lastUpdated && (
            <span className="text-[11px] text-muted-foreground">
              Updated {pool.lastUpdated}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            View pool
            <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
