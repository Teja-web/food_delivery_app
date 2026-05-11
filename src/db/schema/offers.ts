import { text, boolean, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";
import { applications } from "./applications";

// -- Offers ------------------------------------------------------------

export interface OfferCompensation {
  baseBand: string;
  recommended: string;
  equity?: string;
  bonus?: string;
  startTarget?: string;
}

export interface OfferCloseRisk {
  label: string;
  value: string;
}

export interface OfferChecklistEntry {
  label: string;
  done: boolean;
}

export interface OfferOwnership {
  owner: string;
  task: string;
}

// -- Offer Generation Types ------------------------------------------

export interface CompComponent {
  name: string;
  amount: number;
}

export interface ExtractedOfferLetter {
  bandLevel: string | null;
  designation: string | null;
  components: CompComponent[];
  variableBonus: number | null;
  fixedCtc: number | null;
  totalCtc: number | null;
  currency: string | null;
  format: "indian-ctc" | "us-salary" | "other";
  rawText: string;
  sourceFileName: string;
  sourceFileUrl: string;
}

export interface ExtractedPayStub {
  month: string | null;
  grossEarnings: number | null;
  totalDeductions: number | null;
  netPay: number | null;
  earnings: CompComponent[];
  deductions: CompComponent[];
  currency: string | null;
  rawText: string;
  sourceFileName: string;
  sourceFileUrl: string;
}

export interface GeneratedOffer {
  components: CompComponent[];
  totalFixed: number;
  totalCtc: number;
  bonus: number | null;
  equity: string | null;
  currency: string;
  hike: { percentage: number; absolute: number };
  competitivePosition: "below-band" | "at-band" | "above-band";
  negotiationRange: { floor: number; ceiling: number };
  rationale: string;
  generatedAt: string;
  bandCompliance?: "within" | "stretched" | "out-of-band";
  parityRisk?: "low" | "medium" | "high";
  guardrailWarnings?: string[];
}

// -- Offer Version Types -----------------------------------------------

export type OfferTriggerType = "initial" | "candidate_counter" | "recruiter_adjust" | "competing_offer" | "system_generated";

export interface OfferCompState {
  components: CompComponent[];
  totalFixed: number;
  totalCtc: number;
  bonus: number | null;
  equity: string | null;
  currency: string;
  format: "indian-ctc" | "us-salary" | "other";
}

export interface OfferChangeEntry {
  component: string;
  previousAmount: number;
  newAmount: number;
  delta: number;
  reason: string;
}

export interface OfferRiskFlags {
  bandCompliance: "within" | "stretched" | "out-of-band";
  parityRisk: "low" | "medium" | "high";
  budgetImpact: string | null;
}

export interface OfferWithdrawReason {
  reason: "business_change" | "role_eliminated" | "candidate_mismatch" | "budget" | "other";
  notes?: string;
}

export interface OfferDeclineReason {
  reason: "comp_gap" | "competing_offer" | "role_fit" | "personal" | "timeline" | "other";
  compGapAmount?: number;
  compGapCurrency?: string;
  competingCompany?: string;
  competingComp?: number;
  notes?: string;
}

export const offers = dillizntSchema.table("offers", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  candidateId: text("candidate_id"),
  roleId: text("role_id"),
  applicationId: text("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("draft"),
  compBase: text("comp_base"),
  compEquity: text("comp_equity"),
  compBonus: text("comp_bonus"),
  startDate: timestamp("start_date"),
  compensation: jsonb("compensation").$type<OfferCompensation>(),
  closeRisks: jsonb("close_risks").$type<OfferCloseRisk[]>(),
  checklist: jsonb("checklist").$type<OfferChecklistEntry[]>(),
  closeOwnership: jsonb("close_ownership").$type<OfferOwnership[]>(),
  approvalChain: jsonb("approval_chain"),
  recommendation: text("recommendation"),
  extractedOfferLetter: jsonb("extracted_offer_letter").$type<ExtractedOfferLetter>(),
  extractedPayStubs: jsonb("extracted_pay_stubs").$type<ExtractedPayStub[]>(),
  generatedOffer: jsonb("generated_offer").$type<GeneratedOffer>(),
  currentVersionId: text("current_version_id"),
  declineReason: jsonb("decline_reason").$type<OfferDeclineReason>(),
  withdrawReason: jsonb("withdraw_reason").$type<OfferWithdrawReason>(),
  withdrawnAt: timestamp("withdrawn_at"),
  documentUrl: text("document_url"),
  validUntil: timestamp("valid_until"),
  sentAt: timestamp("sent_at"),
  respondedAt: timestamp("responded_at"),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  actorType: text("actor_type"),
  actorId: text("actor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
}, (table) => [
  index("recruit_offers_org_idx").on(table.organizationId),
  index("recruit_offers_pipeline_idx").on(table.applicationId),
  index("recruit_offers_status_idx").on(table.status),
  index("recruit_offers_fts_idx").using("gin", sql`dilliznt.fts_vector(${table.recommendation}, ${table.compBase})`),
]);

export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;

// -- Offer Checklist Items ---------------------------------------------

export const offerChecklistItems = dillizntSchema.table("offer_checklist_items", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  offerId: text("offer_id").notNull().references(() => offers.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  done: boolean("done").notNull().default(false),
  order: integer("order"),
}, (table) => [
  index("recruit_offer_checklist_offer_idx").on(table.offerId),
]);

export type OfferChecklistItem = typeof offerChecklistItems.$inferSelect;
export type NewOfferChecklistItem = typeof offerChecklistItems.$inferInsert;

// -- Offer Versions ----------------------------------------------------

export const offerVersions = dillizntSchema.table("offer_versions", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  offerId: text("offer_id").notNull().references(() => offers.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  triggerType: text("trigger_type").notNull().$type<OfferTriggerType>(),
  changeVector: jsonb("change_vector").$type<{ changes: OfferChangeEntry[] }>(),
  compState: jsonb("comp_state").notNull().$type<OfferCompState>(),
  riskFlags: jsonb("risk_flags").$type<OfferRiskFlags>(),
  justification: text("justification"),
  createdBy: text("created_by"),
  createdById: text("created_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("recruit_offer_versions_offer_idx").on(table.offerId),
  index("recruit_offer_versions_offer_ver_idx").on(table.offerId, table.versionNumber),
]);

export type OfferVersion = typeof offerVersions.$inferSelect;
export type NewOfferVersion = typeof offerVersions.$inferInsert;
