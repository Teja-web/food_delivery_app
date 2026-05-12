import { getPortfolioMetrics } from "@/operations/metrics";

import { MetricsClient } from "./MetricsClient";

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const { window } = await searchParams;
  const parsed = Number.parseInt(window ?? "30", 10);
  const validWindow = [7, 30, 90].includes(parsed) ? parsed : 30;
  const data = await getPortfolioMetrics(validWindow);
  return <MetricsClient data={data} />;
}
