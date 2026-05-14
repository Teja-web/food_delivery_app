/**
 * Integrations / Adapters — org-scoped credentials + binding counts for the
 * /integrations page. Secrets are AES-256-GCM encrypted at rest via
 * `src/lib/integrations/encryption.ts`. Decryption never happens here; the
 * client gets a "configured" boolean plus non-secret `config` fields only.
 */

import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db/client";
import { integrationCredentials, type IntegrationCredential } from "@/db/schema/integrations";
import {
  adapterBindings,
  type AdapterBinding,
  type AdapterProvider,
} from "@/db/schema/adapter-binding";
import { projects } from "@/db/schema/project";
import { getActionContext } from "@/lib/auth/context";
import { encrypt } from "@/lib/integrations/encryption";
import { safeRevalidate } from "@/lib/safe-revalidate";

export async function listOrgIntegrationCredentials(): Promise<IntegrationCredential[]> {
  const ctx = await getActionContext();
  return db
    .select()
    .from(integrationCredentials)
    .where(eq(integrationCredentials.organizationId, ctx.organizationId));
}

export async function getBindingCountsByProvider(): Promise<Record<string, number>> {
  const ctx = await getActionContext();
  const rows = await db
    .select({
      provider: adapterBindings.provider,
      count: sql<number>`count(*)::int`,
    })
    .from(adapterBindings)
    .where(eq(adapterBindings.organizationId, ctx.organizationId))
    .groupBy(adapterBindings.provider);
  const out: Record<string, number> = {};
  for (const row of rows) out[row.provider] = row.count;
  return out;
}

export type BindingWithProject = AdapterBinding & {
  projectName: string | null;
};

export async function listBindingsWithProject(): Promise<BindingWithProject[]> {
  const ctx = await getActionContext();
  const rows = await db
    .select({
      binding: adapterBindings,
      projectName: projects.name,
    })
    .from(adapterBindings)
    .leftJoin(projects, eq(projects.id, adapterBindings.projectId))
    .where(eq(adapterBindings.organizationId, ctx.organizationId))
    .orderBy(adapterBindings.provider, adapterBindings.externalKey);
  return rows.map((r) => ({ ...r.binding, projectName: r.projectName }));
}

export interface SaveCredentialsInput {
  provider: AdapterProvider;
  apiKey: string;
  config?: Record<string, string>;
}

export async function saveIntegrationCredentials(input: SaveCredentialsInput): Promise<void> {
  const ctx = await getActionContext();
  if (!input.apiKey || input.apiKey.trim().length < 3) {
    throw new Error("API key / token is required");
  }
  const apiKeyEncrypted = encrypt(input.apiKey.trim());
  const config = input.config ?? {};
  const category = categoryFor(input.provider);

  await db
    .insert(integrationCredentials)
    .values({
      id: nanoid(),
      organizationId: ctx.organizationId,
      provider: input.provider,
      category,
      apiKeyEncrypted,
      config,
      configuredBy: ctx.userId,
    })
    .onConflictDoUpdate({
      target: [integrationCredentials.organizationId, integrationCredentials.provider],
      set: {
        apiKeyEncrypted,
        config,
        configuredBy: ctx.userId,
        updatedAt: new Date().toISOString(),
      },
    });

  safeRevalidate("/integrations");
}

export async function disconnectIntegration(provider: AdapterProvider): Promise<void> {
  const ctx = await getActionContext();
  await db
    .delete(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.organizationId, ctx.organizationId),
        eq(integrationCredentials.provider, provider),
      ),
    );
  safeRevalidate("/integrations");
}

function categoryFor(provider: AdapterProvider): string {
  switch (provider) {
    case "github":
    case "ado":
      return "scm";
    case "jira":
      return "tracker";
    case "confluence":
      return "wiki";
  }
}
