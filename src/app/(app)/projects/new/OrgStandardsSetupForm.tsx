"use client";

import { Plus, Trash2, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveOrgStandardsSetupAction } from "@/actions/standards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface CustomStandardDraft {
  title: string;
  slug: string;
  body: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function OrgStandardsSetupForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [codingStandardsBody, setCodingStandardsBody] = useState("");
  const [brandGuidelinesBody, setBrandGuidelinesBody] = useState("");
  const [architecturePrinciplesBody, setArchitecturePrinciplesBody] = useState("");
  const [customStandards, setCustomStandards] = useState<CustomStandardDraft[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const requiredComplete =
    codingStandardsBody.trim().length > 0 &&
    brandGuidelinesBody.trim().length > 0 &&
    architecturePrinciplesBody.trim().length > 0;

  function updateCustom(index: number, patch: Partial<CustomStandardDraft>) {
    setCustomStandards((items) =>
      items.map((item, idx) => {
        if (idx !== index) return item;
        const next = { ...item, ...patch };
        if (patch.title !== undefined && item.slug.trim().length === 0) {
          next.slug = slugify(patch.title);
        }
        return next;
      }),
    );
  }

  function save() {
    setErrors([]);
    startTransition(async () => {
      const result = await saveOrgStandardsSetupAction({
        codingStandardsBody,
        brandGuidelinesBody,
        architecturePrinciplesBody,
        customStandards: customStandards
          .map((item) => ({
            title: item.title.trim(),
            slug: item.slug.trim(),
            body: item.body.trim(),
          }))
          .filter((item) => item.title.length > 0 || item.body.length > 0 || item.slug.length > 0),
      });
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Add organization standards first
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Coznt needs these org-level files before the first project can be created. They are stored exactly as entered and inherited by every project unless a project override is added later.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="coding-standards">Coding Standards</Label>
            <Textarea
              id="coding-standards"
              value={codingStandardsBody}
              onChange={(event) => setCodingStandardsBody(event.target.value)}
              rows={7}
              className="font-mono text-xs"
              placeholder="Paste the canonical engineering/coding standards for this organization."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-guidelines">Brand Guidelines</Label>
            <Textarea
              id="brand-guidelines"
              value={brandGuidelinesBody}
              onChange={(event) => setBrandGuidelinesBody(event.target.value)}
              rows={7}
              className="font-mono text-xs"
              placeholder="Paste UI, tone, visual identity, accessibility, and brand constraints."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="architecture-principles">Architecture Principles</Label>
            <Textarea
              id="architecture-principles"
              value={architecturePrinciplesBody}
              onChange={(event) => setArchitecturePrinciplesBody(event.target.value)}
              rows={7}
              className="font-mono text-xs"
              placeholder="Paste architecture principles, platform constraints, security posture, and system design rules."
            />
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Additional org standards</div>
              <p className="text-xs text-muted-foreground">
                Add optional org-scoped files such as accessibility, security, QA, or procurement standards.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCustomStandards((items) => [...items, { title: "", slug: "", body: "" }])}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add standard
            </Button>
          </div>

          {customStandards.map((item, index) => (
            <div key={index} className="space-y-3 rounded-md border bg-muted/10 p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_220px_32px]">
                <Input
                  aria-label="Custom standard title"
                  placeholder="Title"
                  value={item.title}
                  onChange={(event) => updateCustom(index, { title: event.target.value })}
                />
                <Input
                  aria-label="Custom standard slug"
                  placeholder="slug"
                  value={item.slug}
                  onChange={(event) => updateCustom(index, { slug: event.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setCustomStandards((items) => items.filter((_, idx) => idx !== index))}
                  aria-label="Remove custom standard"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
              <Textarea
                aria-label="Custom standard body"
                value={item.body}
                onChange={(event) => updateCustom(index, { body: event.target.value })}
                rows={5}
                className="font-mono text-xs"
                placeholder="Paste the standard exactly as it should be inherited."
              />
            </div>
          ))}
        </div>

        {errors.length > 0 ? (
          <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {errors.map((error) => (
              <div key={error} className="flex items-start gap-1.5">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-end">
          <Button type="button" onClick={save} disabled={pending || !requiredComplete}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Saving
              </>
            ) : (
              "Save standards and continue"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
