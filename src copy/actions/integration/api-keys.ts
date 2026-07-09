"use server";

import {
  listApiKeys,
  listApiKeysForProject,
  listApiKeysWithContext,
  mintApiKey,
  revokeApiKey,
  type MintInput,
  type MintResult,
} from "@/operations/integration/api-keys";

export async function listApiKeysAction() {
  return listApiKeys();
}

export async function listApiKeysWithContextAction() {
  return listApiKeysWithContext();
}

export async function listApiKeysForProjectAction(projectId: string) {
  return listApiKeysForProject(projectId);
}

export async function mintApiKeyAction(input: MintInput): Promise<MintResult> {
  return mintApiKey(input);
}

export async function revokeApiKeyAction(id: string): Promise<void> {
  return revokeApiKey(id);
}
