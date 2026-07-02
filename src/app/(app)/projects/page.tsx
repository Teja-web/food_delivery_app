import { getPortfolioData } from "@/operations/project/portfolio";
import { getOrganizationArtifactsReadiness } from "@/operations/artifacts";

import { PortfolioTable } from "./PortfolioTable";
import { serializePortfolio } from "./serialize";

export default async function ProjectsPage() {
  const [data, standardsReadiness] = await Promise.all([
    getPortfolioData(),
    getOrganizationArtifactsReadiness(),
  ]);
  const client = serializePortfolio(data);

  return <PortfolioTable data={client} standardsReady={standardsReadiness.requiredComplete} />;
}
