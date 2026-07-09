import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { member } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createEventStreamHandler } from "@/lib/events/stream";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export const GET = createEventStreamHandler({
  authenticate: async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session) return null;

    // Resolve org: session active org → first membership fallback
    let orgId = session.session.activeOrganizationId || "";
    if (!orgId) {
      const membership = await (db as any).query.member.findFirst({
        where: eq(member.userId, session.user.id),
      });
      orgId = membership?.organizationId ?? "";
    }

    return {
      userId: session.user.id,
      organizationId: orgId,
    };
  },
});
