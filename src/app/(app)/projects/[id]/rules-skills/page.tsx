import { notFound } from "next/navigation";

import { getProject } from "@/actions/project/projects";
import type { Project } from "@/db/schema/project";
import { listRulesForProject } from "@/operations/rules";
import { listSkillsForProject } from "@/operations/skill/skills";

import { serializeCockpitRule, serializeCockpitSkill } from "../serialize";
import { RulesSkillsTab } from "../tabs/RulesSkillsTab";

export default async function ProjectRulesSkillsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = (await getProject(id)) as Project | null;
  if (!project) notFound();

  const [rules, skills] = await Promise.all([
    listRulesForProject(id, project.phase),
    listSkillsForProject(id),
  ]);

  return (
    <RulesSkillsTab
      rules={rules.map((r) => serializeCockpitRule(r, id))}
      skills={skills.map((s) => serializeCockpitSkill(s, id))}
    />
  );
}
