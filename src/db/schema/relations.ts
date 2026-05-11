import { relations } from "drizzle-orm";
import { user } from "./auth";
import { departments, orgIdentity } from "./organization";

export const departmentsRelations = relations(departments, () => ({}));

export const orgIdentityRelations = relations(orgIdentity, () => ({}));

export const userRelations = relations(user, () => ({}));
