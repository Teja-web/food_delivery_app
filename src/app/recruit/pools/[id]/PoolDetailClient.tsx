"use client";

import { useState } from "react";
import { useEntityEvent } from "@/hooks/use-entity-event";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Layers,
  MapPin,
  Search,
  Sparkles,
  Tag,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AskAIButton } from "@/components/shared/ask-ai-button";
import type { PoolDetailPageProps, SerializedPoolMember } from "./serialize";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/* -- Helpers --------------------------------------------------------- */

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
      return "Needs attention";
    default:
      return health;
  }
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (score >= 60) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-muted-foreground bg-secondary border-border";
}

/* -- Criteria Breakdown ------------------------------------------------- */

function CriteriaBreakdown({ criteria }: { criteria: PoolDetailPageProps["pool"]["criteria"] }) {
  const [open, setOpen] = useState(false);

  if (!criteria) return null;

  const hasSkills = criteria.skills && criteria.skills.length > 0;
  const hasLocations = criteria.locations && criteria.locations.length > 0;
  const hasTags = criteria.tags && criteria.tags.length > 0;
  const hasExperience = criteria.experienceMin != null || criteria.experienceMax != null;

  if (!hasSkills && !hasLocations && !hasTags && !hasExperience) return null;

  const totalCriteria =
    (hasSkills ? 1 : 0) +
    (hasLocations ? 1 : 0) +
    (hasTags ? 1 : 0) +
    (hasExperience ? 1 : 0);

  return (
    <div className="border-t border-border">
      <Button
        variant="ghost"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-3 hover:bg-secondary/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Pool criteria
          </p>
          <span className="text-[10px] text-muted-foreground">
            {totalCriteria} {totalCriteria === 1 ? "category" : "categories"}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </Button>

      {open && (
        <div className="px-6 pb-5 space-y-4">
          {hasSkills && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="h-3 w-3 text-blue-500" />
                <span className="text-xs font-medium text-foreground">Skills</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {criteria.skills!.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {hasLocations && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <MapPin className="h-3 w-3 text-emerald-500" />
                <span className="text-xs font-medium text-foreground">Locations</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {criteria.locations!.map((loc) => (
                  <span
                    key={loc}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700"
                  >
                    {loc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {hasExperience && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="h-3 w-3 text-amber-500" />
                <span className="text-xs font-medium text-foreground">Experience</span>
              </div>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
                {criteria.experienceMin ?? 0} - {criteria.experienceMax ?? "10+"} years
              </span>
            </div>
          )}

          {hasTags && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Tag className="h-3 w-3 text-violet-500" />
                <span className="text-xs font-medium text-foreground">Tags</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {criteria.tags!.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-medium text-violet-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground pt-1">
            AI-generated criteria based on pool description.
          </p>
        </div>
      )}
    </div>
  );
}

/* -- Member Row ------------------------------------------------- */

function MemberRow({ member, rank }: { member: SerializedPoolMember; rank: number }) {
  return (
    <Link
      href={`/recruit/candidates/${member.candidateId}`}
      className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/30 transition-colors"
    >
      <span className="text-[10px] font-medium text-muted-foreground w-4 text-center">
        {rank}
      </span>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-xs font-semibold text-foreground">
        {member.candidateName
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {member.candidateName}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {[member.candidateTitle, member.candidateCompany]
            .filter(Boolean)
            .join(" at ") || "No title"}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {member.candidateTalentScore !== null && (
          <div
            className={cn(
              "rounded-lg border px-2.5 py-1 text-center",
              scoreColor(member.candidateTalentScore)
            )}
          >
            <p className="text-sm font-semibold tabular-nums">
              {member.candidateTalentScore}
            </p>
          </div>
        )}
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}

/* -- Main Component ------------------------------------------------------- */

const PAGE_SIZE = 10;

export default function PoolDetailClient({ pool }: PoolDetailPageProps) {
  useEntityEvent(["pool", "poolMember", "candidate"]);

  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  const filteredMembers = pool.members.filter(
    (m) =>
      !searchQuery ||
      m.candidateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.candidateTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.candidateCompany?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort by talent score descending
  const sortedMembers = [...filteredMembers].sort(
    (a, b) => (b.candidateTalentScore ?? 0) - (a.candidateTalentScore ?? 0)
  );

  // Pagination
  const totalPages = Math.ceil(sortedMembers.length / PAGE_SIZE);
  const paginatedMembers = sortedMembers.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  // Reset to page 1 when search changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="space-y-8">
          {/* Breadcrumb */}
          <Link
            href="/recruit/pools"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            All talent pools
          </Link>

          {/* Profile header */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-lg">
                      <Layers className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
                          {pool.name}
                        </h1>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            poolHealthColor(pool.health)
                          )}
                        >
                          {poolHealthLabel(pool.health)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {pool.candidateCount} candidates · Updated {pool.lastUpdated ?? "never"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <AskAIButton entity="pool" id={pool.id} view="detail" data={{...pool}} />
                  <Link
                    href={`/recruit/pools/${pool.id}/edit`}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
                  >
                    <Edit2 className="h-3 w-3" />
                    Edit
                  </Link>
                </div>
              </div>
            </div>

            {/* Description */}
            {pool.description && (
              <div className="border-t border-border px-6 py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  Description
                </p>
                <p className="text-xs leading-relaxed text-foreground">
                  {pool.description}
                </p>
              </div>
            )}

            {/* AI Signal */}
            {pool.topSignal && (
              <div className="border-t border-border px-6 py-4 bg-amber-50/30">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1">
                      AI Insight
                    </p>
                    <p className="text-xs leading-relaxed text-foreground">
                      {pool.topSignal}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Criteria Breakdown */}
            <CriteriaBreakdown criteria={pool.criteria} />
          </div>

          {/* Two column layout */}
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            {/* Left column: Members */}
            <div className="space-y-6">
              <section>
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <div className="flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        Pool members
                        <span className="text-muted-foreground font-normal">
                          ({pool.members.length})
                        </span>
                      </h2>
                    </div>
                    {pool.members.length > 0 && (
                      <div className="relative mt-3">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Search by name, title, or company..."
                          value={searchQuery}
                          onChange={(e) => handleSearchChange(e.target.value)}
                          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    )}
                  </div>

                  {paginatedMembers.length > 0 ? (
                    <>
                      <div className="divide-y divide-border">
                        {paginatedMembers.map((member, idx) => (
                          <MemberRow
                            key={member.id}
                            member={member}
                            rank={(page - 1) * PAGE_SIZE + idx + 1}
                          />
                        ))}
                      </div>
                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-secondary/20">
                          <p className="text-[11px] text-muted-foreground">
                            Showing {(page - 1) * PAGE_SIZE + 1}-
                            {Math.min(page * PAGE_SIZE, sortedMembers.length)} of{" "}
                            {sortedMembers.length}
                          </p>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="unstyled"
                              onClick={() => setPage((p) => Math.max(1, p - 1))}
                              disabled={page === 1}
                              className={cn(
                                "flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors",
                                page === 1
                                  ? "opacity-50 cursor-not-allowed"
                                  : "hover:bg-secondary"
                              )}
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <span className="px-2 text-xs font-medium text-foreground">
                              {page} / {totalPages}
                            </span>
                            <Button
                              variant="unstyled"
                              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                              disabled={page === totalPages}
                              className={cn(
                                "flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors",
                                page === totalPages
                                  ? "opacity-50 cursor-not-allowed"
                                  : "hover:bg-secondary"
                              )}
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : pool.members.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                        <Users className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          No members yet
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                          Candidates will be automatically added when they match the pool criteria.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                      <Search className="h-6 w-6 text-muted-foreground/30" />
                      <p className="text-xs text-muted-foreground">
                        No members match &ldquo;{searchQuery}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Right column: Matching roles + Stats */}
            <div className="space-y-6">
              {/* Stats cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-blue-500" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Candidates
                    </p>
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-foreground">
                    {pool.candidateCount}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Briefcase className="h-4 w-4 text-emerald-500" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Roles
                    </p>
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-foreground">
                    {pool.matchingRoles.length}
                  </p>
                </div>
              </div>

              {/* Matching Roles */}
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  Matching roles
                </h2>
                {pool.matchingRoles.length > 0 ? (
                  <div className="space-y-2">
                    {pool.matchingRoles.map((role) => (
                      <Link
                        key={role.id}
                        href={`/recruit/roles/${role.id}`}
                        className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 hover:shadow-sm transition-all"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {role.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {pool.candidateCount} potential matches
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-card/50 py-6 text-center">
                    <p className="text-xs text-muted-foreground">
                      No matching roles yet.
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Roles will appear here when they match the pool criteria.
                    </p>
                  </div>
                )}
              </section>

              {/* Quick actions */}
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  Quick actions
                </h2>
                <div className="space-y-2">
                  <Button
                    variant="unstyled"
                    disabled
                    className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left opacity-50 cursor-not-allowed"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">
                        Bulk outreach
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Coming soon
                      </p>
                    </div>
                  </Button>
                  <Button
                    variant="unstyled"
                    disabled
                    className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left opacity-50 cursor-not-allowed"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">
                        Match to role
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Coming soon
                      </p>
                    </div>
                  </Button>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
