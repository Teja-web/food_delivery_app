"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import {
  createCustomChoreographyAction,
  validateChoreographyBodyAction,
} from "@/actions/custom-choreographies";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const SAMPLE_BODY = `---
name: My Workflow
description: One-line summary of what this choreography guides the agent to do.
coznt:
  version: 1.0.0
  required_verbs:
    - get_my_context
  min_autonomy: propose
---

# My Workflow

1. Step one — call get_my_context to ground the request.
2. Step two — propose a change and request approval.
`;

interface Props {
  projects: { id: string; name: string; slug: string }[];
}

export function NewChoreographyForm({ projects }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [scope, setScope] = useState<"org" | "project">("org");
  const [projectId, setProjectId] = useState<string>("");
  const [body, setBody] = useState(SAMPLE_BODY);

  const [bodyErrors, setBodyErrors] = useState<string[] | null>(null);
  const [bodyValidated, setBodyValidated] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<string[] | null>(null);

  async function handleValidate() {
    const result = await validateChoreographyBodyAction(body);
    setBodyValidated(true);
    setBodyErrors(result.ok ? null : result.errors);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErrors(null);
    startTransition(async () => {
      const result = await createCustomChoreographyAction({
        slug: slug.trim(),
        name: name.trim(),
        version: version.trim() || "1.0.0",
        body,
        projectId: scope === "project" ? projectId || null : null,
      });
      if (result.ok) {
        router.push("/choreographies");
      } else {
        setSubmitErrors(result.errors);
      }
    });
  }

  const slugValid = /^[a-z0-9][a-z0-9-]*$/.test(slug);
  const canSubmit =
    !pending &&
    slug.length > 0 &&
    slugValid &&
    name.length > 0 &&
    (scope === "org" || projectId.length > 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                placeholder="e.g. payments-rollout"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
              />
              {slug.length > 0 && !slugValid ? (
                <p className="text-xs text-destructive">
                  Lowercase letters, digits, and hyphens only — must start with a letter or digit.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Becomes <code>.coznt/skills/custom/{slug || "<slug>"}/SKILL.md</code>.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                placeholder="e.g. Payments Rollout Playbook"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as "org" | "project")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org">Org-wide</SelectItem>
                  <SelectItem value="project">Specific project</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select
                value={projectId}
                onValueChange={setProjectId}
                disabled={scope === "org"}
              >
                <SelectTrigger>
                  <SelectValue placeholder={scope === "org" ? "n/a" : "Pick a project"} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                placeholder="1.0.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                pattern="^\d+\.\d+\.\d+$"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <Label htmlFor="body">Body (YAML frontmatter + Markdown)</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleValidate}
              disabled={pending}
            >
              Validate frontmatter
            </Button>
          </div>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setBodyValidated(false);
              setBodyErrors(null);
            }}
            rows={20}
            className="font-mono text-xs"
            spellCheck={false}
          />
          {bodyValidated && bodyErrors === null ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Frontmatter looks good.
            </p>
          ) : null}
          {bodyErrors && bodyErrors.length > 0 ? (
            <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {bodyErrors.map((err, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{err}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {submitErrors && submitErrors.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {submitErrors.map((err, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{err}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.push("/choreographies")}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Saving…
            </>
          ) : (
            "Create choreography"
          )}
        </Button>
      </div>
    </form>
  );
}
