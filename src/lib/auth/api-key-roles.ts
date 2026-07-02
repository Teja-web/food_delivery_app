export const API_KEY_ROLES = ["member", "manager", "admin"] as const;

export type ApiKeyRole = (typeof API_KEY_ROLES)[number];

export const DEFAULT_API_KEY_ROLE: ApiKeyRole = "member";

export const API_KEY_ROLE_LABELS: Record<ApiKeyRole, string> = {
  member: "Member",
  manager: "Manager",
  admin: "Admin",
};

export const API_KEY_ROLE_OPTIONS = API_KEY_ROLES.map((value) => ({
  value,
  label: API_KEY_ROLE_LABELS[value],
}));

const API_KEY_ROLE_SET: ReadonlySet<string> = new Set(API_KEY_ROLES);
const ELEVATED_API_KEY_ROLE_SET: ReadonlySet<string> = new Set(["manager", "admin"]);

export function isApiKeyRole(value: unknown): value is ApiKeyRole {
  return typeof value === "string" && API_KEY_ROLE_SET.has(value);
}

export function parseApiKeyRole(value: unknown): ApiKeyRole {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_API_KEY_ROLE;
  }
  if (isApiKeyRole(value)) return value;
  throw new Error(
    `Invalid API key role "${String(value)}". Allowed roles: ${API_KEY_ROLES.join(", ")}.`,
  );
}

export function isElevatedApiKeyRole(value: unknown): value is Extract<ApiKeyRole, "manager" | "admin"> {
  return typeof value === "string" && ELEVATED_API_KEY_ROLE_SET.has(value);
}
