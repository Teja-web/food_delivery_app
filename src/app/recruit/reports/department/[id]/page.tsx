import { generatePerformanceReport } from "@/actions/roles";
import { db } from "@/db/client";
import { departments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PerformanceReportView } from "../../_components/PerformanceReportView";

export default async function DepartmentReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [dept] = await db
    .select({ name: departments.name })
    .from(departments)
    .where(eq(departments.id, id));

  if (!dept) notFound();

  const report = await generatePerformanceReport({ department: dept.name });

  return <PerformanceReportView report={report} />;
}
