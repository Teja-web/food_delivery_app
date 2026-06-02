import {
  listOrgIntegrationCredentialsAction,
  getBindingCountsByProviderAction,
  listBindingsWithProjectAction,
} from "@/actions/integration/integrations";
import { getActionContext } from "@/lib/auth/context";
import { getMcpDaemonStatus } from "@/operations/integration/mcp-status";
import { IntegrationsClient } from "./IntegrationsClient";
import { McpDaemonCard } from "./McpDaemonCard";
import { serializeIntegrationsOverview } from "./serialize";

export default async function IntegrationsPage() {
  const ctx = await getActionContext();
  const [creds, counts, bindings, mcpStatus] = await Promise.all([
    listOrgIntegrationCredentialsAction(),
    getBindingCountsByProviderAction(),
    listBindingsWithProjectAction(),
    getMcpDaemonStatus(ctx.organizationId),
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
      <McpDaemonCard
        lastSessionAtIso={mcpStatus.lastSession?.startedAt.toISOString() ?? null}
        lastSessionIntent={mcpStatus.lastSession?.intent ?? null}
        lastKeyUseAtIso={mcpStatus.lastKeyUseAt?.toISOString() ?? null}
        activeKeysLast7d={mcpStatus.activeKeysLast7d}
        everUsedKeys={mcpStatus.everUsedKeys}
        activeKeysTotal={mcpStatus.activeKeysTotal}
      />
      <IntegrationsClient overview={overview} />
    </div>
  );
}
