import { describe, expect, it } from "vitest";

import { hasElevatedRole, hasOwnerRole } from "./context";

describe("auth context role helpers", () => {
  it("allows manager API keys through elevated-role checks", () => {
    expect(hasElevatedRole({ isAdmin: false, role: "manager" })).toBe(true);
  });

  it("keeps member API keys non-elevated", () => {
    expect(hasElevatedRole({ isAdmin: false, role: "member" })).toBe(false);
  });

  it("keeps owner as a human-only owner role", () => {
    expect(hasOwnerRole({ role: "owner" })).toBe(true);
    expect(hasOwnerRole({ role: "manager" })).toBe(false);
    expect(hasOwnerRole({ role: "admin" })).toBe(false);
  });
});
