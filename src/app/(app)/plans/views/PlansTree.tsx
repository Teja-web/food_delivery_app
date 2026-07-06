"use client";

import { ChevronRight, CircleAlert, ExternalLink, Network } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { PlanRelationshipRowClient, PlanRowClient } from "../serialize";
import { KIND_DOT_CLASS, KIND_TONE_CLASS, STATUS_TONE_CLASS } from "./tone";

const PRIORITY_ORDER: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };

function siblingSort(a: PlanRowClient, b: PlanRowClient): number {
  const ap = a.priority ? PRIORITY_ORDER[a.priority] ?? 99 : 99;
  const bp = b.priority ? PRIORITY_ORDER[b.priority] ?? 99 : 99;
  if (ap !== bp) return ap - bp;
  return b.updatedAtIso.localeCompare(a.updatedAtIso);
}

type TreeNode = { row: PlanRowClient; children: TreeNode[] };

/**
 * Build a `parent_of` forest. Plans with no parent_of edge pointing at them
 * become roots. Multi-parent plans appear under each parent (parent_of doesn't
 * enforce single-parent).
 */
function buildForest(
  rows: PlanRowClient[],
  relationships: PlanRelationshipRowClient[],
): { roots: TreeNode[]; hasAnyHierarchy: boolean } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const parentOf = relationships.filter((rel) => rel.kind === "parent_of");

  const childIdsByParent = new Map<string, string[]>();
  const childIdsWithParent = new Set<string>();
  for (const rel of parentOf) {
    if (!byId.has(rel.fromProjectTasksId) || !byId.has(rel.toProjectTasksId)) continue;
    const list = childIdsByParent.get(rel.fromProjectTasksId) ?? [];
    list.push(rel.toProjectTasksId);
    childIdsByParent.set(rel.fromProjectTasksId, list);
    childIdsWithParent.add(rel.toProjectTasksId);
  }

  const buildSubtree = (id: string, ancestors: Set<string>): TreeNode | null => {
    if (ancestors.has(id)) return null;
    const row = byId.get(id);
    if (!row) return null;
    const next = new Set(ancestors);
    next.add(id);
    const children = (childIdsByParent.get(id) ?? [])
      .map((cid) => buildSubtree(cid, next))
      .filter((n): n is TreeNode => n !== null)
      .sort((a, b) => siblingSort(a.row, b.row));
    return { row, children };
  };

  const roots = rows
    .filter((r) => !childIdsWithParent.has(r.id))
    .map((r) => buildSubtree(r.id, new Set()))
    .filter((n): n is TreeNode => n !== null)
    .sort((a, b) => siblingSort(a.row, b.row));

  return { roots, hasAnyHierarchy: childIdsByParent.size > 0 };
}

export function PlansTree({
  rows,
  relationships,
  query,
  filtered,
}: {
  rows: PlanRowClient[];
  relationships: PlanRelationshipRowClient[];
  query: string;
  filtered: boolean;
}) {
  const { roots, hasAnyHierarchy } = useMemo(
    () => buildForest(rows, relationships),
    [rows, relationships],
  );

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Network className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" aria-hidden />
          <div className="text-sm font-medium">
            {filtered ? "No plans match this filter" : "No plans yet"}
          </div>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {filtered ? (
              <>Try a different status, kind, or clear the filter{query ? `: "${query}"` : ""}.</>
            ) : (
              <>Tree view shows parent_of hierarchy between plans.</>
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {!hasAnyHierarchy ? (
        <div className="rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          No <code className="font-mono">parent_of</code> relationships found between these plans.
          Tree view shows each plan as a root until relationships are created.
        </div>
      ) : null}
      <div className="overflow-hidden rounded-md border border-border/60">
        <ul role="tree" className="divide-y divide-border/40 text-sm">
          {roots.map((node) => (
            <TreeBranch key={node.row.id} node={node} depth={0} />
          ))}
        </ul>
      </div>
    </>
  );
}

function TreeBranch({ node, depth }: { node: TreeNode; depth: number }) {
  const hasChildren = node.children.length > 0;
  return (
    <li role="treeitem" aria-expanded={hasChildren ? true : undefined} className="bg-card">
      <div
        className="flex items-center gap-2 px-4 py-2 hover:bg-muted/30"
        style={{ paddingLeft: `${16 + depth * 20}px` }}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform",
            hasChildren ? "rotate-90" : "opacity-0",
          )}
          aria-hidden
        />
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", KIND_DOT_CLASS[node.row.kind])}
          aria-hidden
        />
        <Link href={`/plans/${node.row.id}`} className="min-w-0 flex-1 truncate hover:underline">
          <span className="flex items-center gap-1.5 truncate font-medium">
            {node.row.needsApproval ? (
              <CircleAlert
                className="h-3.5 w-3.5 shrink-0 text-state-pending"
                aria-label="Needs approval"
              />
            ) : null}
            <span className="truncate">{node.row.title}</span>
          </span>
        </Link>
        <Badge
          variant="outline"
          className={cn(
            "bg-transparent font-mono text-[10px] uppercase tracking-[0.06em]",
            KIND_TONE_CLASS[node.row.kind],
          )}
        >
          {node.row.kindLabel}
        </Badge>
        <Badge
          variant="outline"
          className={cn("font-mono text-[10px]", STATUS_TONE_CLASS[node.row.statusTone])}
        >
          {node.row.statusLabel}
        </Badge>
        {node.row.priority ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {node.row.priority}
          </span>
        ) : null}
        {node.row.externalRef ? (
          <a
            href={node.row.externalRef}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
            title="Open external reference"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
        <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
          {node.row.updatedAtLabel}
        </span>
      </div>
      {hasChildren ? (
        <ul role="group" className="divide-y divide-border/40">
          {node.children.map((child) => (
            <TreeBranch key={child.row.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
