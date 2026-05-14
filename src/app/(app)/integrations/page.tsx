import {
  listOrgIntegrationCredentialsAction,
  getBindingCountsByProviderAction,
  listBindingsWithProjectAction,
} from "@/actions/integrations";
import { IntegrationsClient } from "./IntegrationsClient";
import { serializeIntegrationsOverview } from "./serialize";

export default async function IntegrationsPage() {
  const [creds, counts, bindings] = await Promise.all([
    listOrgIntegrationCredentialsAction(),
    getBindingCountsByProviderAction(),
    listBindingsWithProjectAction(),
  ]);

  const overview = serializeIntegrationsOverview(creds, counts, bindings);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Adapters</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect coznt to GitHub, Jira, Azure DevOps, and Confluence. Credentials are stored once per
          workspace; individual projects bind to a specific repo/board via per-project bindings.
        </p>
      </div>
      <IntegrationsClient overview={overview} />
    </div>
  );
}
