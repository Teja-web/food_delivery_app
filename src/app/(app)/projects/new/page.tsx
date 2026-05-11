import { redirect } from "next/navigation";
import { createProject } from "@/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

async function action(formData: FormData) {
  "use server";
  const created = await createProject({
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    repoUrl: String(formData.get("repoUrl") ?? "").trim() || undefined,
    jiraProjectKey: String(formData.get("jiraProjectKey") ?? "").trim() || undefined,
  });
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
