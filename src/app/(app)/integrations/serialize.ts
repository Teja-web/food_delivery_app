import type { IntegrationCredential } from "@/db/schema/integrations";
import {
  ADAPTER_PROVIDERS,
  type AdapterBinding,
  type AdapterProvider,
} from "@/db/schema/adapter-binding";
import type { BindingWithProject } from "@/operations/integrations";

export interface ProviderRow {
  provider: AdapterProvider;
  configured: boolean;
  /** Non-secret config (e.g. baseUrl, email, orgUrl). Secrets never travel to the client. */
  config: Record<string, string>;
  configuredAt: string | null;
  updatedAt: string | null;
  bindingCount: number;
}

export interface BindingRow {
  id: string;
  provider: AdapterProvider;
  externalKey: string;
  projectId: string;
  projectName: string | null;
  createdAt: string;
}

export interface IntegrationsOverview {
  providers: ProviderRow[];
  bindings: BindingRow[];
}

export function serializeIntegrationsOverview(
  creds: IntegrationCredential[],
  counts: Record<string, number>,
  bindings: BindingWithProject[],
): IntegrationsOverview {
  const credByProvider = new Map(creds.map((c) => [c.provider, c]));

  const providers: ProviderRow[] = ADAPTER_PROVIDERS.map((provider) => {
    const c = credByProvider.get(provider);
    return {
      provider,
      configured: !!c?.apiKeyEncrypted,
      config: (c?.config as Record<string, string>) ?? {},
      configuredAt: c?.createdAt ? new Date(c.createdAt).toISOString() : null,
      updatedAt: c?.updatedAt ? new Date(c.updatedAt).toISOString() : null,
      bindingCount: counts[provider] ?? 0,
    };
  });

  return {
    providers,
    bindings: bindings.map(serializeBinding),
  };
}

function serializeBinding(b: BindingWithProject): BindingRow {
  return {
    id: b.id,
    provider: b.provider,
    externalKey: b.externalKey,
    projectId: b.projectId,
    projectName: b.projectName,
    createdAt: new Date(b.createdAt).toISOString(),
  };
}

// Re-export for convenience
export type { AdapterProvider, AdapterBinding };
