import { describe, expect, it } from "vitest";

import {
  API_KEY_ROLE_OPTIONS,
  parseApiKeyRole,
  isElevatedApiKeyRole,
} from "./api-key-roles";

describe("API key roles", () => {
  it("defaults missing roles to member", () => {
    expect(parseApiKeyRole(undefined)).toBe("member");
    expect(parseApiKeyRole(null)).toBe("member");
    expect(parseApiKeyRole("")).toBe("member");
  });

  it("accepts member, manager, and admin roles", () => {
    expect(parseApiKeyRole("member")).toBe("member");
    expect(parseApiKeyRole("manager")).toBe("manager");
    expect(parseApiKeyRole("admin")).toBe("admin");
  });

  it("rejects owner and unknown roles", () => {
    expect(() => parseApiKeyRole("owner")).toThrow(/Invalid API key role/);
    expect(() => parseApiKeyRole("superadmin")).toThrow(/Invalid API key role/);
  });

  it("treats manager and admin as elevated API key roles", () => {
    expect(isElevatedApiKeyRole("manager")).toBe(true);
    expect(isElevatedApiKeyRole("admin")).toBe(true);
    expect(isElevatedApiKeyRole("member")).toBe(false);
    expect(isElevatedApiKeyRole("owner")).toBe(false);
  });

  it("does not expose owner in selectable role options", () => {
    expect(API_KEY_ROLE_OPTIONS.map((option) => option.value)).toEqual([
      "member",
      "manager",
      "admin",
    ]);
  });
});
