import { getPortfolioData } from "@/operations/project/portfolio";
import { getOrgStandardsReadiness } from "@/operations/standards";

import { PortfolioTable } from "./PortfolioTable";
import { serializePortfolio } from "./serialize";

export default async function ProjectsPage() {
  const [data, standardsReadiness] = await Promise.all([
    getPortfolioData(),
    getOrgStandardsReadiness(),
  ]);
  const client = serializePortfolio(data);

  return <PortfolioTable data={client} standardsReady={standardsReadiness.requiredComplete} />;
}
