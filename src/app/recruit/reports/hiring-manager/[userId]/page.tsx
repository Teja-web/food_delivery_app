import { generatePerformanceReport } from "@/actions/roles";
import { db } from "@/db/client";
import { user } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PerformanceReportView } from "../../_components/PerformanceReportView";

export default async function HiringManagerReportPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const [found] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  if (!found) notFound();

  const report = await generatePerformanceReport({ hiringManagerId: userId, name: found.name });

  return <PerformanceReportView report={report} />;
}
