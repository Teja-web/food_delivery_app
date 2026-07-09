import { organizationClient, adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const getAuthBaseURL = () => {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3029";
  }
  return "";
};

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
  basePath: "/api/auth",
  plugins: [
    // @ts-ignore - better-auth admin plugin type mismatch
    adminClient(),
    organizationClient({
      dynamicAccessControl: { enabled: true },
    }),
  ],
});

export const { signOut, useSession } = authClient;
