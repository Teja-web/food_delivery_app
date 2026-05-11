import { db } from "@/db/client";
import { candidates } from "@/db/schema";
import { sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/actions";
import { createEventStreamHandler } from "@/lib/events/stream";

export const dynamic = "force-dynamic";

export const GET = createEventStreamHandler({
  authenticate: async () => {
    const userContext = await getCurrentUser();
    if (!userContext?.currentUser) return null;

    const { currentUser } = userContext;
    const email = currentUser.email;

    // Find all candidate records linked to this email
    const linked = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(sql`lower(${candidates.email}) = ${email.toLowerCase()}`);

    const candidateIds = new Set(linked.map((c) => c.id));

    return {
      userId: currentUser.id,
      organizationId: "",
      // Portal users see events for their own candidate records + assessment attempts
      filter: (event) =>
        (event.payload.entityType === "candidate" &&
          candidateIds.has(event.payload.entityId)) ||
        event.payload.entityType === "assessment_attempt",
    };
  },
});
