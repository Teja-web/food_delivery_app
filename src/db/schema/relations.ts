import { relations } from "drizzle-orm";
import { user } from "./auth";
import { departments, orgIdentity } from "./organization";
import { projects } from "./project";
import { plans } from "./plan";
import { planRevisions } from "./plan-revision";
import { rules } from "./rule";
import { skills } from "./skill";
import { approvals } from "./approval";
import { comments } from "./comment";
import { workItems } from "./work-item";

export const departmentsRelations = relations(departments, () => ({}));
export const orgIdentityRelations = relations(orgIdentity, () => ({}));
export const userRelations = relations(user, () => ({}));

export const projectsRelations = relations(projects, ({ many }) => ({
  plans: many(plans),
  rules: many(rules),
  skills: many(skills),
  workItems: many(workItems),
}));

export const plansRelations = relations(plans, ({ one, many }) => ({
  project: one(projects, { fields: [plans.projectId], references: [projects.id] }),
  revisions: many(planRevisions),
  approvals: many(approvals),
  comments: many(comments),
  workItems: many(workItems),
}));

export const planRevisionsRelations = relations(planRevisions, ({ one }) => ({
  plan: one(plans, { fields: [planRevisions.planId], references: [plans.id] }),
}));

export const rulesRelations = relations(rules, ({ one }) => ({
  project: one(projects, { fields: [rules.projectId], references: [projects.id] }),
}));

export const skillsRelations = relations(skills, ({ one }) => ({
  project: one(projects, { fields: [skills.projectId], references: [projects.id] }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  plan: one(plans, { fields: [approvals.planId], references: [plans.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  plan: one(plans, { fields: [comments.planId], references: [plans.id] }),
  parent: one(comments, { fields: [comments.parentCommentId], references: [comments.id], relationName: "commentParent" }),
}));

export const workItemsRelations = relations(workItems, ({ one }) => ({
  project: one(projects, { fields: [workItems.projectId], references: [projects.id] }),
  plan: one(plans, { fields: [workItems.planId], references: [plans.id] }),
}));
