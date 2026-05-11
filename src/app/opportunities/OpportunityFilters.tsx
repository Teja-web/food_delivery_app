"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import {
  INDUSTRY_LABELS,
  INDUSTRY_VALUES,
  STAGE_LABELS,
  STAGE_VALUES,
  REGION_GROUPS,
  REGION_LABELS,
} from "@/lib/anonymize/taxonomy";

interface FiltersValue {
  q?: string;
  region?: string[];
  industry?: string[];
  stage?: string[];
}

export function OpportunityFilters({ initial }: { initial: FiltersValue }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(initial.q ?? "");
  const [region, setRegion] = useState<string[]>(initial.region ?? []);
  const [industry, setIndustry] = useState<string[]>(initial.industry ?? []);
  const [stage, setStage] = useState<string[]>(initial.stage ?? []);

  const submit = useCallback(
    (overrides?: Partial<FiltersValue>) => {
      const next = {
        q: overrides?.q ?? q,
        region: overrides?.region ?? region,
        industry: overrides?.industry ?? industry,
        stage: overrides?.stage ?? stage,
      };
      const params = new URLSearchParams();
      if (next.q?.trim()) params.set("q", next.q.trim());
      if (next.region?.length) params.set("region", next.region.join(","));
      if (next.industry?.length) params.set("industry", next.industry.join(","));
      if (next.stage?.length) params.set("stage", next.stage.join(","));
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [q, region, industry, stage, pathname, router],
  );

  function toggle(values: string[], setValues: (v: string[]) => void, val: string, key: keyof FiltersValue) {
    const next = values.includes(val) ? values.filter((v) => v !== val) : [...values, val];
    setValues(next);
    submit({ [key]: next });
  }

  function clearAll() {
    setQ("");
    setRegion([]);
    setIndustry([]);
    setStage([]);
    startTransition(() => router.replace(pathname));
  }

  const anyActive = !!q || region.length > 0 || industry.length > 0 || stage.length > 0;

  return (
    <div className="space-y-4">
      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="relative"
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => submit({ q })}
          placeholder="Search by title — Software Engineer, Product Manager, ..."
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
      </form>

      {/* Chip groups */}
      <FilterGroup
        label="Industry"
        values={INDUSTRY_VALUES}
        labels={INDUSTRY_LABELS as Record<string, string>}
        selected={industry}
        onToggle={(v) => toggle(industry, setIndustry, v, "industry")}
      />
      <FilterGroup
        label="Stage"
        values={STAGE_VALUES}
        labels={STAGE_LABELS as Record<string, string>}
        selected={stage}
        onToggle={(v) => toggle(stage, setStage, v, "stage")}
      />
      <RegionGroups selected={region} onToggle={(v) => toggle(region, setRegion, v, "region")} />

      {anyActive && (
        <button
          type="button"
          onClick={clearAll}
          disabled={pending}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3 w-3" /> Clear filters
        </button>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  values,
  labels,
  selected,
  onToggle,
}: {
  label: string;
  values: readonly string[];
  labels: Record<string, string>;
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Chip
            key={v}
            label={labels[v] ?? v}
            selected={selected.includes(v)}
            onClick={() => onToggle(v)}
          />
        ))}
      </div>
    </div>
  );
}

function RegionGroups({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        Region
      </p>
      <div className="space-y-1.5">
        {REGION_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 text-[10px] font-medium text-muted-foreground/70">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.values.map((v) => (
                <Chip
                  key={v}
                  label={REGION_LABELS[v]}
                  selected={selected.includes(v)}
                  onClick={() => onToggle(v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
        selected
          ? "border-amber-500 bg-amber-500 text-white"
          : "border-border bg-card text-foreground hover:border-amber-200"
      }`}
    >
      {label}
    </button>
  );
}
