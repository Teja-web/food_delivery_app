ALTER TABLE "dilliznt"."plans" ADD COLUMN "parent_plan_id" text;--> statement-breakpoint
CREATE INDEX "plans_parent_idx" ON "dilliznt"."plans" USING btree ("parent_plan_id");