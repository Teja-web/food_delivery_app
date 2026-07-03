import { describe, expect, it } from "vitest";

import { serializeApiKey } from "./serialize";
import type { ApiKeyWithContext } from "@/operations/integration/api-keys";

describe("API key serialization", () => {
  it("preserves the assigned API key role for UI tables", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const row = serializeApiKey({
      id: "key_1",
      organizationId: "org_1",
      projectId: "project_1",
      name: "manager key",
      prefix: "dlz_abcd",
      keyHash: "hash",
      role: "manager",
      createdById: "user_1",
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: now,
      projectName: "Calculator",
      projectSlug: "calculator",
      createdByName: "Owner",
      createdByEmail: "owner@example.com",
    } satisfies ApiKeyWithContext);

    expect(row.role).toBe("manager");
    expect(row.status).toBe("active");
  });
});
