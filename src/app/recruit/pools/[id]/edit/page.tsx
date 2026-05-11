"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Loader2, Trash2, Users } from "lucide-react";
import { fetchPool, editPool, removePool } from "@/actions/pools";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function EditPoolPage() {
  const router = useRouter();
  const params = useParams();
  const poolId = params.id as string;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPool() {
      try {
        const pool = await fetchPool(poolId);
        if (pool) {
          setName((pool as any).name ?? "");
          setDescription((pool as any).description ?? "");
        }
      } catch (err) {
        setError("Failed to load pool");
      } finally {
        setLoading(false);
      }
    }
    loadPool();
  }, [poolId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Pool name is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await editPool(poolId, {
        name: name.trim(),
        description: description.trim() || null,
      });
      router.push(`/recruit/pools/${poolId}`);
    } catch (err) {
      console.error("Failed to update pool:", err);
      setError(err instanceof Error ? err.message : "Failed to update pool");
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this pool? This cannot be undone.")) {
      return;
    }

    setDeleting(true);
    try {
      await removePool(poolId);
      router.push("/recruit/pools");
    } catch (err) {
      console.error("Failed to delete pool:", err);
      setError(err instanceof Error ? err.message : "Failed to delete pool");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="space-y-8">
          <Link
            href={`/recruit/pools/${poolId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to pool
          </Link>

          <div>
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Users className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Edit Pool
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Edit pool details
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Update the pool name or description. The system will re-analyze
              and update criteria automatically.
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
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-foreground">
                  Description
                </Label>
                <Textarea
                  rows={4}
                  placeholder="Describe the ideal candidates for this pool..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button
                type="button"
                variant="unstyled"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Delete pool
              </Button>

              <div className="flex items-center gap-3">
                <Link
                  href={`/recruit/pools/${poolId}`}
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
                      Saving...
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
