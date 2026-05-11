CREATE TABLE "dilliznt"."skill_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"invocation_id" text,
	"verdict" text NOT NULL,
	"severity" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dilliznt"."skill_autonomy" (
	"skill_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"level_set_at" timestamp DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp,
	"next_review_at" timestamp,
	"last_reason" text
);
--> statement-breakpoint
ALTER TABLE "dilliznt"."skill_outcomes" ADD CONSTRAINT "skill_outcomes_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "dilliznt"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."skill_autonomy" ADD CONSTRAINT "skill_autonomy_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "dilliznt"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_outcomes_skill_time_idx" ON "dilliznt"."skill_outcomes" USING btree ("skill_id","recorded_at");--> statement-breakpoint
CREATE INDEX "skill_outcomes_org_time_idx" ON "dilliznt"."skill_outcomes" USING btree ("organization_id","recorded_at");
