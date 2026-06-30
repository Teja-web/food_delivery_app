import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db/client";
import { member } from "@/db/schema";
import { auth } from "@/lib/auth";

export interface RequestAuthContext {
  userId: string;
  organizationId: string;
}

export async function getRequestAuthContext(): Promise<RequestAuthContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;

  let orgId = session.session.activeOrganizationId || "";
  if (!orgId) {
    const membership = await db.query.member.findFirst({
      where: eq(member.userId, session.user.id),
      columns: { organizationId: true },
    });
    orgId = membership?.organizationId ?? "";
  }
  if (!orgId) return null;

  return {
    userId: session.user.id,
    organizationId: orgId,
  };
}
