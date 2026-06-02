import { getPortfolioData } from "@/operations/project/portfolio";

import { PortfolioTable } from "./PortfolioTable";
import { serializePortfolio } from "./serialize";

export default async function ProjectsPage() {
  const data = await getPortfolioData();
  const client = serializePortfolio(data);

  return <PortfolioTable data={client} />;
}
