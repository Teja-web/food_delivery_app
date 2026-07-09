"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  isPending?: boolean;
  label?: string;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, pageSize, isPending, label = "items", onPageChange }: PaginationProps) {
  if (total <= pageSize) return null;

  const start = ((page - 1) * pageSize) + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-xs text-muted-foreground">
        Showing {start}–{end} of {total.toLocaleString()} {label}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-xs"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1 || isPending}
          className="rounded-md text-muted-foreground disabled:opacity-30"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        {Array.from({ length: Math.min(3, totalPages) }, (_, i) => i + 1).map((p) => (
          <Button
            key={p}
            variant="pill"
            size="pill-sm"
            onClick={() => onPageChange(p)}
            disabled={isPending}
            data-active={page === p || undefined}
          >
            {p}
          </Button>
        ))}
        {totalPages > 3 && (
          <>
            <span className="px-1 text-xs text-muted-foreground">...</span>
            <Button
              variant="pill"
              size="pill-sm"
              onClick={() => onPageChange(totalPages)}
              disabled={isPending}
              data-active={page === totalPages || undefined}
            >
              {totalPages}
            </Button>
          </>
        )}
        <Button
          variant="outline"
          size="icon-xs"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages || isPending}
          className="rounded-md text-muted-foreground disabled:opacity-30"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
