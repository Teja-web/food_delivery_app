import type { Project } from "@/db/schema/project";
import type {
  PortfolioData,
  PortfolioProjectRow,
  PortfolioRollup,
  ProjectHealth,
  TrendDir,
} from "@/operations/portfolio";

export interface ProjectListItemDTO {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phase: Project["phase"];
  status: Project["status"];
  updatedAt: string;
}

export function serializeProject(p: Project): ProjectListItemDTO {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    phase: p.phase,
    status: p.status,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export type GateStateClient = "pending" | "passed" | "failed" | "skipped";

export interface PortfolioGateClient {
  name: string;
  state: GateStateClient;
}

export interface AutonomyPostureClient {
  observe: number;
  propose: number;
  merge: number;
  lead: number;
  total: number;
  incidentsLast7d: number;
}

export interface PortfolioProjectClient {
  id: string;
  name: string;
  slug: string;
  shortKey: string;
  phase: Project["phase"];
  status: Project["status"];
  health: ProjectHealth;
  hasRegression: boolean;
  isStale: boolean;
  staleDays: number;
  gates: {
    passed: number;
    total: number;
    items: PortfolioGateClient[];
  };
  openApprovals: number;
  leadTimeDays: number | null;
  deploys30d: number | null;
  cfr30d: number | null;
  cfrSparkline: number[] | null;
  cfrTrendDirection: TrendDir | null;
  cfrWowDeltaPoints: number | null;
  autonomyPosture: AutonomyPostureClient;
}

export interface PortfolioRollupClient {
  openApprovals: number;
  deploysThisWeek: number;
  autonomyEvents: { promotions: number; demotions: number };
  portfolioCFR: { value: number | null; wowDeltaPoints: number };
}

export interface PortfolioClient {
  rollup: PortfolioRollupClient;
  projects: PortfolioProjectClient[];
}

function serializePortfolioProject(row: PortfolioProjectRow): PortfolioProjectClient {
  return {
    id: row.project.id,
    name: row.project.name,
    slug: row.project.slug,
    shortKey: row.shortKey,
    phase: row.project.phase,
    status: row.project.status,
    health: row.health,
    hasRegression: row.hasRegression,
    isStale: row.isStale,
    staleDays: row.staleDays,
    gates: {
      passed: row.gates.passed,
      total: row.gates.total,
      items: row.gates.items.map((g) => ({ name: g.name, state: g.status as GateStateClient })),
    },
    openApprovals: row.openApprovals,
    leadTimeDays: row.leadTimeDays,
    deploys30d: row.deploys30d,
    cfr30d: row.cfr30d,
    cfrSparkline: row.cfrSparkline,
    cfrTrendDirection: row.cfrTrendDirection,
    cfrWowDeltaPoints: row.cfrWowDeltaPoints,
    autonomyPosture: row.autonomyPosture,
  };
}

function serializePortfolioRollup(rollup: PortfolioRollup): PortfolioRollupClient {
  return {
    openApprovals: rollup.openApprovals,
    deploysThisWeek: rollup.deploysThisWeek,
    autonomyEvents: rollup.autonomyEvents,
    portfolioCFR: rollup.portfolioCFR,
  };
}

export function serializePortfolio(data: PortfolioData): PortfolioClient {
  return {
    rollup: serializePortfolioRollup(data.rollup),
    projects: data.rows.map(serializePortfolioProject),
  };
}
