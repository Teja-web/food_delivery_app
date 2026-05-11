import { db } from "@/db/client";
import { interviews } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { serializePortalInterview } from "./serialize";
import PickSlotClient from "./PickSlotClient";

export default async function PortalInterviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Look up interview by candidate token — no auth required
  const result = await db.query.interviews.findFirst({
    where: eq(interviews.candidateToken, token),
    with: {
      application: { with: { role: true, candidate: true } },
      stage: true,
      panelists: { with: { user: true } },
    },
  });

  if (!result) notFound();

  const props = serializePortalInterview(result as any);

  return <PickSlotClient {...props} token={token} />;
}
