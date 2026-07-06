import { relations } from "drizzle-orm";
import { user } from "./auth";
import { projects } from "./project";
import { repositories } from "./repository";
import { environments } from "./environment";
import { projectTasks } from "./plan/project-task";
import { planRelationships } from "./plan/plan-relationship";
import { planRevisions } from "./plan/plan-revision";
import { comments } from "./plan/comment";
import { rules } from "./rule";
import { skills } from "./skill/skill";
import { skillOutcomes } from "./skill/skill-outcome";
import { skillAutonomy } from "./skill/skill-autonomy";
import { workItems } from "./work-item";
import { governancePolicies } from "./governance/policies";
import { governanceRecords } from "./governance/records";
import { evidenceLinks } from "./evidence";
import { metrics } from "./metric";
import { deployments } from "./deployment";
import { testRuns } from "./test-run";
import { adapterBindings } from "./adapter-binding";
import { promptLogs } from "./prompt-log";

export const userRelations = relations(user, () => ({}));

export const projectsRelations = relations(projects, ({ many }) => ({
  projectTasks: many(projectTasks),
  repositories: many(repositories),
  environments: many(environments),
  rules: many(rules),
  skills: many(skills),
  workItems: many(workItems),
  governancePolicies: many(governancePolicies),
  governanceRecords: many(governanceRecords),
  evidenceLinks: many(evidenceLinks),
  metrics: many(metrics),
  deployments: many(deployments),
  testRuns: many(testRuns),
  adapterBindings: many(adapterBindings),
  promptLogs: many(promptLogs),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  project: one(projects, { fields: [repositories.projectId], references: [projects.id] }),
  workItems: many(workItems),
}));

export const environmentsRelations = relations(environments, ({ one, many }) => ({
  project: one(projects, { fields: [environments.projectId], references: [projects.id] }),
  deployments: many(deployments),
}));

export const promptLogsRelations = relations(promptLogs, ({ one }) => ({
  project: one(projects, { fields: [promptLogs.projectId], references: [projects.id] }),
}));

export const adapterBindingsRelations = relations(adapterBindings, ({ one }) => ({
  project: one(projects, { fields: [adapterBindings.projectId], references: [projects.id] }),
}));

export const projectTasksRelations = relations(projectTasks, ({ one, many }) => ({
  project: one(projects, { fields: [projectTasks.projectId], references: [projects.id] }),
  revisions: many(planRevisions),
  comments: many(comments),
  workItems: many(workItems),
  governanceRecords: many(governanceRecords),
  evidenceLinks: many(evidenceLinks),
  outgoingRelationships: many(planRelationships, { relationName: "fromProjectTask" }),
  incomingRelationships: many(planRelationships, { relationName: "toProjectTask" }),
  deployments: many(deployments),
  testRuns: many(testRuns),
}));

export const planRelationshipsRelations = relations(planRelationships, ({ one }) => ({
  from: one(projectTasks, {
    fields: [planRelationships.fromProjectTasksId],
    references: [projectTasks.id],
    relationName: "fromProjectTask",
  }),
  to: one(projectTasks, {
    fields: [planRelationships.toProjectTasksId],
    references: [projectTasks.id],
    relationName: "toProjectTask",
  }),
}));

export const planRevisionsRelations = relations(planRevisions, ({ one }) => ({
  projectTask: one(projectTasks, {
    fields: [planRevisions.projectTasksId],
    references: [projectTasks.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  projectTask: one(projectTasks, {
    fields: [comments.projectTaskId],
    references: [projectTasks.id],
  }),
  parent: one(comments, {
    fields: [comments.parentCommentId],
    references: [comments.id],
    relationName: "commentParent",
  }),
}));

export const rulesRelations = relations(rules, ({ one }) => ({
  project: one(projects, { fields: [rules.projectId], references: [projects.id] }),
}));

export const skillsRelations = relations(skills, ({ one, many }) => ({
  project: one(projects, { fields: [skills.projectId], references: [projects.id] }),
  outcomes: many(skillOutcomes),
  autonomy: many(skillAutonomy),
}));

export const skillOutcomesRelations = relations(skillOutcomes, ({ one }) => ({
  skill: one(skills, { fields: [skillOutcomes.skillId], references: [skills.id] }),
  project: one(projects, { fields: [skillOutcomes.projectId], references: [projects.id] }),
}));

export const skillAutonomyRelations = relations(skillAutonomy, ({ one }) => ({
  skill: one(skills, { fields: [skillAutonomy.skillId], references: [skills.id] }),
  project: one(projects, { fields: [skillAutonomy.projectId], references: [projects.id] }),
}));

export const workItemsRelations = relations(workItems, ({ one }) => ({
  project: one(projects, { fields: [workItems.projectId], references: [projects.id] }),
  projectTask: one(projectTasks, {
    fields: [workItems.projectTaskId],
    references: [projectTasks.id],
  }),
  repository: one(repositories, {
    fields: [workItems.repositoryId],
    references: [repositories.id],
  }),
}));

export const governancePoliciesRelations = relations(governancePolicies, ({ many }) => ({
  records: many(governanceRecords),
}));

export const governanceRecordsRelations = relations(governanceRecords, ({ one }) => ({
  projectTask: one(projectTasks, {
    fields: [governanceRecords.projectTaskId],
    references: [projectTasks.id],
  }),
  policy: one(governancePolicies, {
    fields: [governanceRecords.policyId],
    references: [governancePolicies.id],
  }),
  project: one(projects, {
    fields: [governanceRecords.projectId],
    references: [projects.id],
  }),
}));

export const evidenceLinksRelations = relations(evidenceLinks, ({ one }) => ({
  projectTask: one(projectTasks, {
    fields: [evidenceLinks.projectTaskId],
    references: [projectTasks.id],
  }),
  project: one(projects, {
    fields: [evidenceLinks.projectId],
    references: [projects.id],
  }),
}));

export const metricsRelations = relations(metrics, ({ one }) => ({
  project: one(projects, { fields: [metrics.projectId], references: [projects.id] }),
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  project: one(projects, { fields: [deployments.projectId], references: [projects.id] }),
  projectTask: one(projectTasks, {
    fields: [deployments.projectTaskId],
    references: [projectTasks.id],
  }),
  environment: one(environments, {
    fields: [deployments.environmentId],
    references: [environments.id],
  }),
}));

export const testRunsRelations = relations(testRuns, ({ one }) => ({
  project: one(projects, { fields: [testRuns.projectId], references: [projects.id] }),
  projectTask: one(projectTasks, {
    fields: [testRuns.projectTaskId],
    references: [projectTasks.id],
  }),
}));
