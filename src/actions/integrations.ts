"use server";

import {
  listOrgIntegrationCredentials,
  getBindingCountsByProvider,
  listBindingsWithProject,
  saveIntegrationCredentials,
  disconnectIntegration,
  type SaveCredentialsInput,
} from "@/operations/integrations";
import type { AdapterProvider } from "@/db/schema/adapter-binding";

export async function listOrgIntegrationCredentialsAction() {
  return listOrgIntegrationCredentials();
}

export async function getBindingCountsByProviderAction() {
  return getBindingCountsByProvider();
}

export async function listBindingsWithProjectAction() {
  return listBindingsWithProject();
}

export async function saveIntegrationCredentialsAction(input: SaveCredentialsInput) {
  return saveIntegrationCredentials(input);
}

export async function disconnectIntegrationAction(provider: AdapterProvider) {
  return disconnectIntegration(provider);
}
