/**
 * Auth Schema — Drizzle definitions for better-auth tables.
 */

import { pgSchema, foreignKey, text, boolean, jsonb, timestamp, unique } from "drizzle-orm/pg-core";

export const authSchema = pgSchema("auth");

export const role = authSchema.enum("role", ["member", "admin", "owner"]);

export const organization = authSchema.table("organization", {
  id: text().primaryKey().notNull(),
  name: text().notNull(),
  slug: text(),
  logo: text(),
  website: text(),
  industry: text(),
  size: text(),
  location: text(),
  description: text(),
  type: text().default("standard").notNull(),
  publicProfile: jsonb("public_profile"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  metadata: jsonb(),
}, (table) => [
  unique("organization_slug_unique").on(table.slug),
]);

export const user = authSchema.table("user", {
  id: text().primaryKey().notNull(),
  name: text().notNull(),
  email: text().notNull(),
  emailVerified: boolean().default(false).notNull(),
  image: text(),
  role: text().default("user"),
  banned: boolean().default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  hasCompletedOnboarding: boolean("has_completed_onboarding").default(false).notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = authSchema.table("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const member = authSchema.table("member", {
  id: text().primaryKey().notNull(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  role: role().default("member").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.organizationId],
    foreignColumns: [organization.id],
    name: "member_organization_id_organization_id_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [user.id],
    name: "member_user_id_user_id_fk",
  }).onDelete("cascade"),
]);

export const session = authSchema.table("session", {
  id: text().primaryKey().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text().notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text(),
  userAgent: text(),
  userId: text().notNull(),
  activeOrganizationId: text("active_organization_id"),
  impersonatedBy: text("impersonated_by"),
}, (table) => [
  foreignKey({
    columns: [table.userId],
    foreignColumns: [user.id],
    name: "session_userId_user_id_fk",
  }).onDelete("cascade"),
  unique("session_token_unique").on(table.token),
]);

export const account = authSchema.table("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const invitation = authSchema.table("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId").notNull().references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: role(),
  status: text("status").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  inviterId: text("inviterId").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
