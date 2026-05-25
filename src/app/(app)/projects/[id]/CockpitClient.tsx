"use client";

import {
  Activity,
  ChevronLeft,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Files,
  GitBranch,
  LayoutDashboard,
  Milestone,
  Plus,
  Rocket,
  ScrollText,
  Shield,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ConnectCursorModal } from "./ConnectCursorModal";
import type { CockpitClient as CockpitData } from "./serialize";
import { CICDTab } from "./tabs/CICDTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { PhasesTab } from "./tabs/PhasesTab";
import { PlansTab } from "./tabs/PlansTab";
import { RulesSkillsTab } from "./tabs/RulesSkillsTab";
import { TrustTab } from "./tabs/TrustTab";
import { WorkItemsTab } from "./tabs/WorkItemsTab";

const PHASE_LABEL: Record<CockpitData["project"]["phase"], string> = {
  requirements: "REQUIREMENTS",
  design: "DESIGN",
  development: "DEVELOPMENT",
  testing: "TESTING",
  cicd: "CI/CD",
  monitoring: "MONITORING",
};

const REQUIREMENT_KINDS = ["epic", "feature", "story", "requirement"];
const ADR_KINDS = ["adr"];
const TEST_KINDS = ["test_plan"];

export function CockpitClient({ data }: { data: CockpitData }) {
  const [cursorOpen, setCursorOpen] = useState(false);
  const { project, plans, workItems, deployments, rules, skills } = data;

  const requirementCount = plans.filter((p) => REQUIREMENT_KINDS.includes(p.kind)).length;
  const testCount = plans.filter((p) => TEST_KINDS.includes(p.kind)).length;
  const adrCount = plans.filter((p) => ADR_KINDS.includes(p.kind)).length;

  return (
    <div className="space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Portfolio
      </Link>

      <header className="flex items-start justify-between gap-6 border-b pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{project.name}</h1>
            <Badge
              variant="outline"
              className="border-state-pending/40 px-1.5 py-0 font-mono text-[10px] uppercase tracking-wide text-state-pending"
            >
              {PHASE_LABEL[project.phase]}
            </Badge>
          </div>
          {project.description ? (
            <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{project.description}</p>
          ) : null}
          <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
            {project.slug} · created {new Date(project.createdAt).toLocaleDateString()}
            {project.repoUrl ? (
              <>
                <span className="mx-2 opacity-40">·</span>
                <a
                  href={project.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  repo <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </>
            ) : null}
            {project.jiraProjectKey ? (
              <>
                <span className="mx-2 opacity-40">·</span>
                <span>Jira {project.jiraProjectKey}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCursorOpen(true)}>
            Open in Cursor
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/plans/new?projectId=${project.id}`}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> New plan
            </Link>
          </Button>
        </div>
      </header>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="overview" className="gap-1.5 data-[state=active]:bg-muted">
            <LayoutDashboard className="h-3.5 w-3.5" aria-hidden /> Overview
          </TabsTrigger>
          <TabsTrigger value="requirements" className="gap-1.5 data-[state=active]:bg-muted">
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden /> Requirements
            {requirementCount > 0 && <span className="ml-0.5 font-mono text-[10px] opacity-70">{requirementCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="work-items" className="gap-1.5 data-[state=active]:bg-muted">
            <GitBranch className="h-3.5 w-3.5" aria-hidden /> Work items
            {workItems.length > 0 && <span className="ml-0.5 font-mono text-[10px] opacity-70">{workItems.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="test-cases" className="gap-1.5 data-[state=active]:bg-muted">
            <Activity className="h-3.5 w-3.5" aria-hidden /> Test plans
            {testCount > 0 && <span className="ml-0.5 font-mono text-[10px] opacity-70">{testCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="adrs" className="gap-1.5 data-[state=active]:bg-muted">
            <ScrollText className="h-3.5 w-3.5" aria-hidden /> ADRs
            {adrCount > 0 && <span className="ml-0.5 font-mono text-[10px] opacity-70">{adrCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5 data-[state=active]:bg-muted">
            <FileText className="h-3.5 w-3.5" aria-hidden /> Documents
          </TabsTrigger>
          <TabsTrigger value="rules-skills" className="gap-1.5 data-[state=active]:bg-muted">
            <Shield className="h-3.5 w-3.5" aria-hidden /> Rules & skills
            {(rules.length > 0 || skills.length > 0) && (
              <span className="ml-0.5 font-mono text-[10px] opacity-70">{rules.length + skills.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="phases" className="gap-1.5 data-[state=active]:bg-muted">
            <Milestone className="h-3.5 w-3.5" aria-hidden /> Phases
          </TabsTrigger>
          <TabsTrigger value="cicd" className="gap-1.5 data-[state=active]:bg-muted">
            <Rocket className="h-3.5 w-3.5" aria-hidden /> CI/CD
            {deployments.length > 0 && <span className="ml-0.5 font-mono text-[10px] opacity-70">{deployments.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="trust" className="gap-1.5 data-[state=active]:bg-muted">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Trust
            {data.trust.outcomes.length > 0 && (
              <span className="ml-0.5 font-mono text-[10px] opacity-70">
                {data.trust.outcomes.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all-plans" className="gap-1.5 data-[state=active]:bg-muted">
            <Files className="h-3.5 w-3.5" aria-hidden /> All plans
            {plans.length > 0 && <span className="ml-0.5 font-mono text-[10px] opacity-70">{plans.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <OverviewTab data={data} />
        </TabsContent>

        <TabsContent value="requirements" className="mt-0">
          <PlansTab
            plans={plans}
            projectId={project.id}
            kinds={REQUIREMENT_KINDS}
            title="Requirements"
            emptyHint="No requirements yet — capture user stories, features, or epics here"
          />
        </TabsContent>

        <TabsContent value="work-items" className="mt-0">
          <WorkItemsTab items={workItems} />
        </TabsContent>

        <TabsContent value="test-cases" className="mt-0">
          <PlansTab
            plans={plans}
            projectId={project.id}
            kinds={TEST_KINDS}
            title="Test plans"
            emptyHint="No test plans yet"
          />
        </TabsContent>

        <TabsContent value="adrs" className="mt-0">
          <PlansTab
            plans={plans}
            projectId={project.id}
            kinds={ADR_KINDS}
            title="Architecture decision records"
            emptyHint="No ADRs yet — record the load-bearing technical decisions for this project"
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-0">
          <DocumentsTab plans={plans} workItems={workItems} />
        </TabsContent>

        <TabsContent value="rules-skills" className="mt-0">
          <RulesSkillsTab rules={rules} skills={skills} />
        </TabsContent>

        <TabsContent value="phases" className="mt-0">
          <PhasesTab data={data} />
        </TabsContent>

        <TabsContent value="cicd" className="mt-0">
          <CICDTab deployments={deployments} />
        </TabsContent>

        <TabsContent value="trust" className="mt-0">
          <TrustTab
            projectId={data.project.id}
            outcomes={data.trust.outcomes}
            policy={data.trust.policy}
            learnings={data.trust.learnings}
            promptQuality={data.trust.promptQuality}
            promptGovernanceEnabled={data.trust.promptGovernanceEnabled}
          />
        </TabsContent>

        <TabsContent value="all-plans" className="mt-0">
          <PlansTab
            plans={plans}
            projectId={project.id}
            kinds={null}
            title="All plans"
            emptyHint="No plans authored yet"
          />
        </TabsContent>
      </Tabs>

      <ConnectCursorModal
        open={cursorOpen}
        onOpenChange={setCursorOpen}
        projectSlug={project.slug}
        apiKeyPrefix={data.apiKey.prefix}
        apiKeyPlaintext={data.apiKey.plaintext}
        isNewKey={data.apiKey.isNew}
      />
    </div>
  );
}
