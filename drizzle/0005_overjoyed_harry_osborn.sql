CREATE TABLE "coznt"."skill_autonomy_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"project_id" text,
	"direction" text NOT NULL,
	"from_level" integer NOT NULL,
	"to_level" integer NOT NULL,
	"reason" text NOT NULL,
	"triggering_outcome_ids" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coznt"."plans" ADD COLUMN "ai_authored" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "coznt"."plans" ADD COLUMN "generated_by_model" text;--> statement-breakpoint
ALTER TABLE "coznt"."plans" ADD COLUMN "generated_by_skill_id" text;--> statement-breakpoint
ALTER TABLE "coznt"."plans" ADD COLUMN "autonomy_at_generation" integer;--> statement-breakpoint
ALTER TABLE "coznt"."plans" ADD COLUMN "prompt_hash" text;--> statement-breakpoint
ALTER TABLE "coznt"."plans" ADD COLUMN "generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "coznt"."work_items" ADD COLUMN "ai_authored" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "coznt"."work_items" ADD COLUMN "generated_by_model" text;--> statement-breakpoint
ALTER TABLE "coznt"."work_items" ADD COLUMN "generated_by_skill_id" text;--> statement-breakpoint
ALTER TABLE "coznt"."work_items" ADD COLUMN "autonomy_at_generation" integer;--> statement-breakpoint
ALTER TABLE "coznt"."work_items" ADD COLUMN "prompt_hash" text;--> statement-breakpoint
ALTER TABLE "coznt"."work_items" ADD COLUMN "generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "coznt"."phase_gates" ADD COLUMN "overridden_at" timestamp;--> statement-breakpoint
ALTER TABLE "coznt"."phase_gates" ADD COLUMN "overridden_by_id" text;--> statement-breakpoint
ALTER TABLE "coznt"."phase_gates" ADD COLUMN "override_reason" text;--> statement-breakpoint
ALTER TABLE "coznt"."phase_gates" ADD COLUMN "override_authorizing_plan_id" text;--> statement-breakpoint
ALTER TABLE "coznt"."phase_gates" ADD COLUMN "override_autonomy_at_time" integer;--> statement-breakpoint
ALTER TABLE "coznt"."skill_autonomy_events" ADD CONSTRAINT "skill_autonomy_events_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "coznt"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skill_autonomy_events" ADD CONSTRAINT "skill_autonomy_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_autonomy_events_skill_time_idx" ON "coznt"."skill_autonomy_events" USING btree ("skill_id","created_at");--> statement-breakpoint
CREATE INDEX "skill_autonomy_events_project_time_idx" ON "coznt"."skill_autonomy_events" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "skill_autonomy_events_org_time_idx" ON "coznt"."skill_autonomy_events" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "coznt"."plans" ADD CONSTRAINT "plans_generated_by_skill_id_skills_id_fk" FOREIGN KEY ("generated_by_skill_id") REFERENCES "coznt"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."work_items" ADD CONSTRAINT "work_items_generated_by_skill_id_skills_id_fk" FOREIGN KEY ("generated_by_skill_id") REFERENCES "coznt"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."phase_gates" ADD CONSTRAINT "phase_gates_override_authorizing_plan_id_plans_id_fk" FOREIGN KEY ("override_authorizing_plan_id") REFERENCES "coznt"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plans_generated_by_skill_idx" ON "coznt"."plans" USING btree ("generated_by_skill_id");--> statement-breakpoint
CREATE INDEX "work_items_generated_by_skill_idx" ON "coznt"."work_items" USING btree ("generated_by_skill_id");