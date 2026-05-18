/**
 * /choreographies/new — author a custom choreography.
 *
 * Form posts to `createCustomChoreographyAction`. Body is validated
 * server-side via the shared `validateChoreographyBody`; the client form
 * also runs a debounced validation pass to surface frontmatter errors
 * inline.
 */

import { eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { db } from "@/db/client";
import { projects } from "@/db/schema/project";
import { getActionContext } from "@/lib/auth/context";

import { NewChoreographyForm } from "./NewChoreographyForm";

export default async function NewChoreographyPage() {
  const ctx = await getActionContext();
  const allProjects = await db
    .select({ id: projects.id, name: projects.name, slug: projects.slug })
    .from(projects)
    .where(eq(projects.organizationId, ctx.organizationId));
  const sorted = [...allProjects].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/choreographies"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Custom choreographies
      </Link>

      <header>
        <h1 className="font-display text-2xl font-semibold">New choreography</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Workflow guide your developers will see in their AI editor after the next{" "}
          <code>coznt sync</code>. Body is YAML frontmatter + Markdown — the{" "}
          <code>name</code>, <code>description</code>, <code>coznt.version</code>, and{" "}
          <code>coznt.required_verbs</code> fields are required.
        </p>
      </header>

      <NewChoreographyForm projects={sorted} />
    </div>
  );
}
