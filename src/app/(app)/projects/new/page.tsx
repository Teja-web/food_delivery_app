import { redirect } from "next/navigation";
import { createProject } from "@/actions/project/projects";
import { adapterBindingCrud } from "@/operations/choreography/adapter-bindings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// Match a GitHub web URL or SSH ref and return the `host/owner/repo` externalKey
// expected by `adapter_bindings` (see src/db/schema/adapter-binding.ts).
function githubExternalKeyFromUrl(repoUrl: string): string | null {
  const trimmed = repoUrl.trim();
  if (!trimmed) return null;
  const web = trimmed.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i);
  if (web) return `${web[1]}/${web[2]}/${web[3]}`;
  const ssh = trimmed.match(/^git@([^:]+):([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i);
  if (ssh) return `${ssh[1]}/${ssh[2]}/${ssh[3]}`;
  return null;
}

async function action(formData: FormData) {
  "use server";
  const repoUrl = String(formData.get("repoUrl") ?? "").trim() || undefined;
  const created = await createProject({
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    repoUrl,
    jiraProjectKey: String(formData.get("jiraProjectKey") ?? "").trim() || undefined,
  });

  const externalKey = repoUrl ? githubExternalKeyFromUrl(repoUrl) : null;
  if (externalKey) {
    try {
      await adapterBindingCrud.create({
        projectId: created.id,
        provider: "github",
        externalKey,
      });
    } catch {
      // Duplicate or race — the project is created either way; the user can
      // re-bind from the integrations page once a UI exists for it.
    }
  }

  redirect(`/projects/${created.id}`);
}

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New project</h1>
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">Slug</Label>
          <Input id="slug" name="slug" required pattern="[a-z0-9-]+" placeholder="my-project" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="repoUrl">Repo URL</Label>
          <Input id="repoUrl" name="repoUrl" placeholder="https://github.com/org/repo" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="jiraProjectKey">Jira project key</Label>
          <Input id="jiraProjectKey" name="jiraProjectKey" placeholder="PROJ" />
        </div>
        <Button type="submit">Create project</Button>
      </form>
    </div>
  );
}
