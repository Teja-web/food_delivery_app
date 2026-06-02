"use server";

import { mintApiKey, listApiKeys, revokeApiKey, type MintInput, type MintResult } from "@/operations/integration/api-keys";

export async function listApiKeysAction() {
  return listApiKeys();
}

export async function mintApiKeyAction(input: MintInput): Promise<MintResult> {
  return mintApiKey(input);
}

export async function revokeApiKeyAction(id: string): Promise<void> {
  return revokeApiKey(id);
}
