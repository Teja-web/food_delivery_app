CREATE TABLE "coznt"."prompt_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"mcp_session_id" text,
	"role" text DEFAULT 'USER' NOT NULL,
	"source" text DEFAULT 'OTHER' NOT NULL,
	"content" text NOT NULL,
	"phase" text,
	"author_name" text,
	"author_username" text,
	"author_email" text,
	"client_local_id" text,
	"prompt_score" integer,
	"prompt_tier" text,
	"prompt_score_detail" jsonb,
	"rubric_version" text,
	"scored_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coznt"."skill_outcomes" ALTER COLUMN "skill_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coznt"."skill_outcomes" ALTER COLUMN "verdict" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coznt"."skill_outcomes" ADD COLUMN "prompt_log_id" text;--> statement-breakpoint
ALTER TABLE "coznt"."prompt_logs" ADD CONSTRAINT "prompt_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_logs_project_time_idx" ON "coznt"."prompt_logs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "prompt_logs_project_tier_idx" ON "coznt"."prompt_logs" USING btree ("project_id","prompt_tier");--> statement-breakpoint
CREATE INDEX "prompt_logs_session_idx" ON "coznt"."prompt_logs" USING btree ("mcp_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_logs_client_local_unique" ON "coznt"."prompt_logs" USING btree ("project_id","client_local_id") WHERE "coznt"."prompt_logs"."client_local_id" is not null;--> statement-breakpoint
CREATE INDEX "prompt_logs_fts_idx" ON "coznt"."prompt_logs" USING gin (coznt.fts_vector("content"));--> statement-breakpoint
CREATE INDEX "skill_outcomes_project_kind_time_idx" ON "coznt"."skill_outcomes" USING btree ("project_id","source_kind","recorded_at");