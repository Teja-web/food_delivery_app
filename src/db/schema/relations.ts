import { relations } from "drizzle-orm";
import { user } from "./auth";
import { departments, orgIdentity } from "./organization";
import { projects } from "./project";
import { plans } from "./plan";
import { planRevisions } from "./plan-revision";
import { rules } from "./rule";
import { skills } from "./skill";
import { skillOutcomes } from "./skill-outcome";
import { skillAutonomy } from "./skill-autonomy";
import { comments } from "./comment";
import { workItems } from "./work-item";
import { phaseGates } from "./phase-gate";
import { metrics } from "./metric";

export const departmentsRelations = relations(departments, () => ({}));
export const orgIdentityRelations = relations(orgIdentity, () => ({}));
export const userRelations = relations(user, () => ({}));

export const projectsRelations = relations(projects, ({ many }) => ({
  plans: many(plans),
  rules: many(rules),
  skills: many(skills),
  workItems: many(workItems),
  phaseGates: many(phaseGates),
  metrics: many(metrics),
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
  autonomy: one(skillAutonomy, { fields: [skills.id], references: [skillAutonomy.skillId] }),
}));

export const skillOutcomesRelations = relations(skillOutcomes, ({ one }) => ({
  skill: one(skills, { fields: [skillOutcomes.skillId], references: [skills.id] }),
}));

export const skillAutonomyRelations = relations(skillAutonomy, ({ one }) => ({
  skill: one(skills, { fields: [skillAutonomy.skillId], references: [skills.id] }),
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
