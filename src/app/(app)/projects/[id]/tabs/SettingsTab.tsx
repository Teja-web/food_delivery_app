import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { CockpitProjectClient } from "../serialize";
import { saveProjectSettings } from "./settings-actions";

export function SettingsTab({ project }: { project: CockpitProjectClient }) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-base font-semibold">Project settings</h2>
        <p className="text-xs text-muted-foreground">
          Identity, upstream-tracker bindings, and risk-zone configuration. Phase, status, and the
          merge-approval policy are managed elsewhere on the cockpit.
        </p>
      </header>

      <form action={saveProjectSettings.bind(null, project.id)} className="space-y-8">
        <section className="space-y-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Identity
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="settings-name" className="text-xs">
                Name
              </Label>
              <Input
                id="settings-name"
                name="name"
                defaultValue={project.name}
                required
                placeholder="Payments API"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-slug" className="text-xs">
                Slug <span className="text-muted-foreground">(read-only)</span>
              </Label>
              <Input
                id="settings-slug"
                defaultValue={project.slug}
                disabled
                placeholder="payments-api"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-description" className="text-xs">
              Description
            </Label>
            <Textarea
              id="settings-description"
              name="description"
              defaultValue={project.description ?? ""}
              rows={2}
              placeholder="One-liner describing what this project owns"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Upstream bindings
          </h3>
          <p className="text-xs text-muted-foreground">
            Coznt reads from these systems and routes inbound webhooks through them. Org-level
            credentials must already be configured in Adapters before per-project bindings take
            effect.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="settings-repo-url" className="text-xs">
                Repo URL
              </Label>
              <Input
                id="settings-repo-url"
                name="repoUrl"
                defaultValue={project.repoUrl ?? ""}
                placeholder="https://github.com/acme/payments-api"
              />
              <p className="text-[11px] text-muted-foreground">
                Used to route inbound PR / deploy webhooks. Changes here update the
                <code className="mx-1 font-mono">adapter_bindings</code>
                row on next save.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-jira-key" className="text-xs">
                Jira project key
              </Label>
              <Input
                id="settings-jira-key"
                name="jiraProjectKey"
                defaultValue={project.jiraProjectKey ?? ""}
                placeholder="PAY"
              />
              <p className="text-[11px] text-muted-foreground">
                Short uppercase identifier (e.g. <code className="font-mono">PAY</code>).
                Enables <code className="font-mono">get_assigned_work</code> to return real Jira
                issues.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-ado" className="text-xs">
                Azure DevOps project ID
              </Label>
              <Input
                id="settings-ado"
                name="adoProjectId"
                defaultValue={project.adoProjectId ?? ""}
                placeholder="org/project-guid"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-confluence" className="text-xs">
                Confluence space key
              </Label>
              <Input
                id="settings-confluence"
                name="confluenceSpaceKey"
                defaultValue={project.confluenceSpaceKey ?? ""}
                placeholder="PAY"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Risk zones
          </h3>
          <p className="text-xs text-muted-foreground">
            Path globs that flag elevated-risk surface area. The change-risk classifier and the
            execution gate use these to bias autonomy decisions. One per line, or comma-separated.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="settings-critical-paths" className="text-xs">
              Critical paths
            </Label>
            <Textarea
              id="settings-critical-paths"
              name="criticalPaths"
              defaultValue={project.criticalPaths.join("\n")}
              rows={3}
              placeholder={"src/payments/**\nsrc/auth/**"}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-prod-critical-paths" className="text-xs">
              Production-critical paths
            </Label>
            <Textarea
              id="settings-prod-critical-paths"
              name="productionCriticalPaths"
              defaultValue={project.productionCriticalPaths.join("\n")}
              rows={3}
              placeholder={"deploy/prod/**\nterraform/**"}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Stricter superset of critical paths — touched by production deploys. Used by the
              go-live gate.
            </p>
          </div>
        </section>

        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-[11px] text-muted-foreground">
            Updated{" "}
            <time dateTime={project.updatedAt}>
              {new Date(project.updatedAt).toLocaleString()}
            </time>
          </p>
          <Button type="submit">Save changes</Button>
        </div>
      </form>
    </div>
  );
}
