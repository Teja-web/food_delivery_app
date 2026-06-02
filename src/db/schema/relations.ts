import { relations } from "drizzle-orm";
import { user } from "./auth";
import { projects } from "./project";
import { plans } from "./plan/plan";
import { planRevisions } from "./plan/plan-revision";
import { rules } from "./rule";
import { skills } from "./skill/skill";
import { skillOutcomes } from "./skill/skill-outcome";
import { skillAutonomy } from "./skill/skill-autonomy";
import { comments } from "./plan/comment";
import { workItems } from "./work-item";
import { phaseGates } from "./phase-gate";
import { metrics } from "./metric";
import { adapterBindings } from "./adapter-binding";
import { promptLogs } from "./prompt-log";

export const userRelations = relations(user, () => ({}));

export const projectsRelations = relations(projects, ({ many }) => ({
  plans: many(plans),
  rules: many(rules),
  skills: many(skills),
  workItems: many(workItems),
  phaseGates: many(phaseGates),
  metrics: many(metrics),
  adapterBindings: many(adapterBindings),
  promptLogs: many(promptLogs),
}));

export const promptLogsRelations = relations(promptLogs, ({ one }) => ({
  project: one(projects, { fields: [promptLogs.projectId], references: [projects.id] }),
}));

export const adapterBindingsRelations = relations(adapterBindings, ({ one }) => ({
  project: one(projects, { fields: [adapterBindings.projectId], references: [projects.id] }),
}));

export const plansRelations = relations(plans, ({ one, many }) => ({
  project: one(projects, { fields: [plans.projectId], references: [projects.id] }),
  revisions: many(planRevisions),
  comments: many(comments),
  workItems: many(workItems),
}));

export const planRevisionsRelations = relations(planRevisions, ({ one }) => ({
  plan: one(plans, { fields: [planRevisions.planId], references: [plans.id] }),
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

export const commentsRelations = relations(comments, ({ one }) => ({
  plan: one(plans, { fields: [comments.planId], references: [plans.id] }),
  parent: one(comments, { fields: [comments.parentCommentId], references: [comments.id], relationName: "commentParent" }),
}));

export const workItemsRelations = relations(workItems, ({ one }) => ({
  project: one(projects, { fields: [workItems.projectId], references: [projects.id] }),
  plan: one(plans, { fields: [workItems.planId], references: [plans.id] }),
}));

export const phaseGatesRelations = relations(phaseGates, ({ one }) => ({
  project: one(projects, { fields: [phaseGates.projectId], references: [projects.id] }),
}));

export const metricsRelations = relations(metrics, ({ one }) => ({
  project: one(projects, { fields: [metrics.projectId], references: [projects.id] }),
}));
