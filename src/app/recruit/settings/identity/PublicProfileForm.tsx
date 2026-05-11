"use client";

import { useState, useTransition } from "react";
import { Check, Globe, Save } from "lucide-react";
import { saveOrgPublicProfile } from "@/actions/org-public-profile";
import {
  INDUSTRY_VALUES,
  INDUSTRY_LABELS,
  STAGE_VALUES,
  STAGE_LABELS,
  SIZE_VALUES,
  SIZE_LABELS,
  REGION_GROUPS,
  REGION_LABELS,
  composePublicLabel,
  type Industry,
  type OrgPublicProfile,
  type Region,
  type SizeBucket,
  type Stage,
} from "@/lib/anonymize/taxonomy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function PublicProfileForm({
  initial,
}: {
  initial: OrgPublicProfile | null;
}) {
  const [industry, setIndustry] = useState<Industry | "">(initial?.industry ?? "");
  const [stage, setStage] = useState<Stage | "">(initial?.stage ?? "");
  const [size, setSize] = useState<SizeBucket | "">(initial?.size ?? "");
  const [region, setRegion] = useState<Region | "">(initial?.region ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initial?.websiteUrl ?? "");
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isComplete = industry && stage && size && region;
  const preview = isComplete
    ? composePublicLabel({
        industry,
        stage,
        size,
        region,
        description: description || undefined,
        websiteUrl: websiteUrl || undefined,
      })
    : null;

  function save() {
    if (!isComplete) {
      setError("All four fields (industry, stage, size, region) are required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await saveOrgPublicProfile({
          industry,
          stage,
          size,
          region,
          description: description || undefined,
          websiteUrl: websiteUrl || undefined,
        });
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-1 flex items-center gap-2">
        <Globe className="h-4 w-4 text-amber-600" />
        <h2 className="font-display text-base font-semibold text-foreground">
          Public profile
        </h2>
      </div>
      <p className="mb-5 text-xs text-muted-foreground">
        Used when a role on this org is listed as <em>anonymized</em> on the public
        opportunities page. Strangers see the bucketed label, never your org name.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Industry" required>
          <Select value={industry} onChange={(v) => setIndustry(v as Industry)}>
            <option value="">— Select —</option>
            {INDUSTRY_VALUES.map((v) => (
              <option key={v} value={v}>
                {INDUSTRY_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Stage" required>
          <Select value={stage} onChange={(v) => setStage(v as Stage)}>
            <option value="">— Select —</option>
            {STAGE_VALUES.map((v) => (
              <option key={v} value={v}>
                {STAGE_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Size" required>
          <Select value={size} onChange={(v) => setSize(v as SizeBucket)}>
            <option value="">— Select —</option>
            {SIZE_VALUES.map((v) => (
              <option key={v} value={v}>
                {SIZE_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Headquarters region" required>
          <Select value={region} onChange={(v) => setRegion(v as Region)}>
            <option value="">— Select —</option>
            {REGION_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.values.map((v) => (
                  <option key={v} value={v}>
                    {REGION_LABELS[v]}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Public description" hint="Optional · max 280 chars">
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 280))}
            placeholder="One line about what you do (shown on the public listing)."
          />
        </Field>
        <Field label="Website (only shown when role is fully public)">
          <Input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://"
          />
        </Field>
      </div>

      {/* Preview */}
      <div className="mt-5 rounded-xl border border-dashed border-stone-200 bg-stone-50/50 p-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Public listing preview
        </p>
        {preview ? (
          <p className="text-sm font-medium text-foreground">{preview}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Fill in the four fields above to see the public label.
          </p>
        )}
      </div>

      {error && (
        <p className="mt-3 text-xs text-rose-600">{error}</p>
      )}

      <div className="mt-5 flex items-center justify-end gap-3">
        {savedAt && (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        <Button onClick={save} disabled={pending} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />
          {pending ? "Saving..." : "Save public profile"}
        </Button>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-foreground">
        {label}
        {required && <span className="text-rose-500">*</span>}
        {hint && <span className="ml-1 font-normal text-muted-foreground">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
    >
      {children}
    </select>
  );
}
