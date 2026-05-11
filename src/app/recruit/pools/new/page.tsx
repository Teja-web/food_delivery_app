"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles, Users } from "lucide-react";
import { addPool } from "@/actions/pools";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function NewPoolPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Pool name is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const pool = await addPool({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      router.push(`/recruit/pools/${(pool as any).id}`);
    } catch (err) {
      console.error("Failed to create pool:", err);
      setError(err instanceof Error ? err.message : "Failed to create pool");
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="space-y-8">
          <Link
            href="/recruit/pools"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Talent Pools
          </Link>

          <div>
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Users className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                New Pool
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Create a talent pool
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Define your pool with a name and description. The system will
              automatically extract criteria and match against open roles.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 space-y-5">
              <div>
                <Label className="text-xs font-semibold text-foreground">
                  Pool name
                </Label>
                <Input
                  type="text"
                  placeholder="e.g. Senior Backend Engineers — Payments"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-foreground">
                  Description
                </Label>
                <Textarea
                  rows={4}
                  placeholder="Describe the ideal candidates for this pool. Include skills, experience levels, locations, or any other relevant criteria."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Be specific — mention skills, years of experience, industries,
                  or regions to help the AI extract accurate criteria.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50/30 p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[8px]">
                  ✦
                </div>
                <p className="text-xs font-semibold text-amber-900">
                  What happens next
                </p>
              </div>
              <ul className="space-y-1.5 text-xs leading-relaxed text-foreground">
                <li className="flex items-start gap-2">
                  <Sparkles className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                  <span>
                    AI will analyze your description and extract structured
                    criteria (skills, locations, experience levels)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Sparkles className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                  <span>
                    The system will identify which open roles match this pool
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Sparkles className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                  <span>
                    Pool members will be automatically recommended for matching
                    roles
                  </span>
                </li>
              </ul>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Link
                href="/recruit/pools"
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </Link>
              <Button
                type="submit"
                variant="default"
                disabled={submitting || !name.trim()}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Creating pool...
                  </>
                ) : (
                  <>
                    <Users className="h-3 w-3" />
                    Create pool
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
