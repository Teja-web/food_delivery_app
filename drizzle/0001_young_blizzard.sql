ALTER TABLE "coznt"."plan_artifacts" ADD COLUMN "claimed_path" text;--> statement-breakpoint
ALTER TABLE "coznt"."rules" ADD COLUMN "claimed_path" text;--> statement-breakpoint
ALTER TABLE "coznt"."rules" ADD COLUMN "severity_override" text;--> statement-breakpoint
ALTER TABLE "coznt"."skills" ADD COLUMN "claimed_path" text;--> statement-breakpoint
ALTER TABLE "coznt"."skills" ADD COLUMN "required_level_override" integer;--> statement-breakpoint
ALTER TABLE "coznt"."skills" ADD COLUMN "sensitivity_override" text;--> statement-breakpoint
ALTER TABLE "coznt"."skills" ADD COLUMN "autonomy_override_until" timestamp;--> statement-breakpoint
ALTER TABLE "coznt"."skills" ADD COLUMN "risk_class" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "coznt"."skills" ADD COLUMN "config" jsonb;--> statement-breakpoint
CREATE INDEX "plan_artifacts_claimed_path_idx" ON "coznt"."plan_artifacts" USING btree ("project_id","claimed_path");--> statement-breakpoint
CREATE INDEX "rules_claimed_path_idx" ON "coznt"."rules" USING btree ("organization_id","claimed_path");--> statement-breakpoint
CREATE INDEX "skills_claimed_path_idx" ON "coznt"."skills" USING btree ("organization_id","claimed_path");