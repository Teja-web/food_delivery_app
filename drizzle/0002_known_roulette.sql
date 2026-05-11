CREATE TABLE "dilliznt"."deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"plan_id" text,
	"environment" text NOT NULL,
	"version" text NOT NULL,
	"commit_sha" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"deployed_by_id" text,
	"deployed_by_name" text,
	"ci_run_url" text,
	"notes" text,
	"raw" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"rolled_back_at" timestamp,
	"rolled_back_reason" text
);
--> statement-breakpoint
CREATE TABLE "dilliznt"."test_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"plan_id" text,
	"suite" text,
	"commit_sha" text,
	"branch" text,
	"status" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"coverage" double precision,
	"ci_run_url" text,
	"raw" jsonb,
	"ran_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dilliznt"."deployments" ADD CONSTRAINT "deployments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "dilliznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."deployments" ADD CONSTRAINT "deployments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dilliznt"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."test_runs" ADD CONSTRAINT "test_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "dilliznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."test_runs" ADD CONSTRAINT "test_runs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dilliznt"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployments_project_env_time_idx" ON "dilliznt"."deployments" USING btree ("project_id","environment","started_at");--> statement-breakpoint
CREATE INDEX "deployments_project_status_idx" ON "dilliznt"."deployments" USING btree ("project_id","status","started_at");--> statement-breakpoint
CREATE INDEX "deployments_plan_idx" ON "dilliznt"."deployments" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "test_runs_project_time_idx" ON "dilliznt"."test_runs" USING btree ("project_id","ran_at");--> statement-breakpoint
CREATE INDEX "test_runs_project_status_idx" ON "dilliznt"."test_runs" USING btree ("project_id","status","ran_at");--> statement-breakpoint
CREATE INDEX "test_runs_plan_idx" ON "dilliznt"."test_runs" USING btree ("plan_id");