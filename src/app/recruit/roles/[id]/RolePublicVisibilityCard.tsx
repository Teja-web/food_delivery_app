"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Eye, Globe, Lock, Sparkles } from "lucide-react";
import { setRolePublicVisibilityAction } from "@/actions/roles";
import {
  composePublicLabel,
  type OrgPublicProfile,
} from "@/lib/anonymize/taxonomy";
import type { BucketLevel } from "@/lib/anonymize/k-anonymity";
import type { PublicVisibility } from "@/db/schema/roles";
import { Button } from "@/components/ui/button";

interface CardProps {
  roleId: string;
  initialVisibility: PublicVisibility;
  initialSlug: string | null;
  orgProfile: OrgPublicProfile | null;
  bucket: BucketLevel | null;
}

const OPTIONS: Array<{
  value: PublicVisibility;
  label: string;
  description: string;
  icon: typeof Lock;
}> = [
  {
    value: "private",
    label: "Private",
    description: "Only signed-in matched candidates see this role.",
    icon: Lock,
  },
  {
    value: "anonymized",
    label: "Anonymized",
    description: "Listed publicly with bucketed labels. Org name and exact comp redacted.",
    icon: Eye,
  },
  {
    value: "public",
    label: "Public",
    description: "Listed publicly with full org name and exact comp.",
    icon: Globe,
  },
];

export function RolePublicVisibilityCard({
  roleId,
  initialVisibility,
  initialSlug,
  orgProfile,
  bucket,
}: CardProps) {
  const [visibility, setVisibility] = useState<PublicVisibility>(initialVisibility);
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = visibility !== initialVisibility;
  const anonymizedAvailable = bucket?.ok ?? false;
  const profileMissing = !orgProfile;

  const previewLabel = orgProfile ? composePublicLabel(orgProfile) : null;
  const publicUrl = slug ? `/opportunities/${slug}` : null;

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setRolePublicVisibilityAction(roleId, visibility);
        if (!result.ok) {
          setError(
            result.reason === "no_public_profile"
              ? "Set your org public profile in Identity settings before listing this role."
              : "Your org's bucket is too small for safe anonymization — pick Public or stay Private.",
          );
          setVisibility(initialVisibility);
          return;
        }
        setSlug(result.publicSlug);
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
        setVisibility(initialVisibility);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-1 flex items-center gap-2">
        <Globe className="h-4 w-4 text-amber-600" />
        <h2 className="font-display text-base font-semibold text-foreground">
          Public visibility
        </h2>
      </div>
      <p className="mb-5 text-xs text-muted-foreground">
        Controls whether strangers can see this role on the public{" "}
        <Link href="/opportunities" className="font-medium text-amber-700 hover:underline">
          /opportunities
        </Link>{" "}
        page, and how much detail they see.
      </p>

      {profileMissing && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-xs">
            <p className="font-semibold text-amber-900">No public profile yet</p>
            <p className="mt-0.5 text-amber-700">
              Anonymized listings need industry/stage/size/region buckets.{" "}
              <Link
                href="/recruit/settings/identity"
                className="font-medium underline hover:no-underline"
              >
                Set them in Identity settings
              </Link>{" "}
              before opting in.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = visibility === opt.value;
          const disabled =
            opt.value === "anonymized" && (profileMissing || !anonymizedAvailable);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => !disabled && setVisibility(opt.value)}
              disabled={disabled}
              className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                selected
                  ? "border-amber-300 bg-amber-50/40"
                  : disabled
                    ? "cursor-not-allowed border-border opacity-50"
                    : "border-border hover:border-amber-200"
              }`}
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  selected ? "text-amber-600" : "text-muted-foreground"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {opt.description}
                </p>
                {opt.value === "anonymized" && !profileMissing && (
                  <BucketStatus bucket={bucket} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Preview */}
      {(visibility === "anonymized" || visibility === "public") && (
        <div className="mt-5 rounded-xl border border-dashed border-stone-200 bg-stone-50/50 p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Public listing preview
          </p>
          <p className="text-sm font-medium text-foreground">
            {visibility === "anonymized"
              ? previewLabel ?? "Set the org public profile to see this preview."
              : "Your org name and full role details."}
          </p>
          {publicUrl && initialVisibility !== "private" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Permalink:{" "}
              <Link href={publicUrl} className="font-medium text-amber-700 hover:underline">
                {publicUrl}
              </Link>
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

      <div className="mt-5 flex items-center justify-end gap-3">
        {savedAt && (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        <Button onClick={save} disabled={pending || !dirty} className="gap-1.5">
          {pending ? "Saving..." : "Save visibility"}
        </Button>
      </div>
    </section>
  );
}

function BucketStatus({ bucket }: { bucket: BucketLevel | null }) {
  if (!bucket) return null;
  if (!bucket.ok) {
    return (
      <p className="mt-2 flex items-center gap-1 text-[11px] text-rose-600">
        <AlertTriangle className="h-3 w-3" />
        Bucket too small ({bucket.count} org{bucket.count === 1 ? "" : "s"} share your industry/stage/region) — anonymization disabled to prevent re-identification.
      </p>
    );
  }
  if (bucket.level === "full") {
    return (
      <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-700">
        <Sparkles className="h-3 w-3" />
        {bucket.count} orgs share your bucket — strong anonymity.
      </p>
    );
  }
  if (bucket.level === "no-size") {
    return (
      <p className="mt-2 text-[11px] text-amber-700">
        {bucket.count} orgs at coarser bucket (size dropped) — your label will omit company size.
      </p>
    );
  }
  return (
    <p className="mt-2 text-[11px] text-amber-700">
      {bucket.count} orgs at country-level bucket — your label will use a country instead of metro.
    </p>
  );
}
