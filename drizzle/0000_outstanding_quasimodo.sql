CREATE SCHEMA "coznt";
--> statement-breakpoint
CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE TYPE "auth"."role" AS ENUM('member', 'admin', 'owner');--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"email" text NOT NULL,
	"role" "auth"."role",
	"status" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"inviterId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "auth"."role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"website" text,
	"industry" text,
	"size" text,
	"location" text,
	"description" text,
	"type" text DEFAULT 'standard' NOT NULL,
	"public_profile" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	"active_organization_id" text,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"has_completed_onboarding" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."documents" (
	"id" text PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"content" text,
	"embedding" vector(1536),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coznt_documents_table_record_uniq" UNIQUE("table_name","record_id")
);
--> statement-breakpoint
CREATE TABLE "coznt"."integration_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"category" text NOT NULL,
	"client_id_encrypted" text,
	"client_secret_encrypted" text,
	"api_key_encrypted" text,
	"config" jsonb,
	"configured_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "integration_credentials_org_provider_unique" UNIQUE("organization_id","provider")
);
--> statement-breakpoint
CREATE TABLE "coznt"."oauth_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"account_email" text,
	"account_name" text,
	"scopes" jsonb,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"token_type" text DEFAULT 'Bearer',
	"token_expires_at" timestamp,
	"connected_at" timestamp,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_connections_user_provider_unique" UNIQUE("organization_id","user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "coznt"."automation_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"entity_type" text,
	"entity_id" text,
	"task_id" text NOT NULL,
	"trace_id" text,
	"status" text NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	"actor_type" text,
	"actor_id" text,
	"output_table" text,
	"output_id" text,
	"output_action" text,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "coznt"."rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."projects" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"phase" text DEFAULT 'requirements' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"repo_url" text,
	"jira_project_key" text,
	"ado_project_id" text,
	"confluence_space_key" text,
	"critical_paths" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"production_critical_paths" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"require_human_approval_for_merge" boolean DEFAULT false NOT NULL,
	"created_by_id" text,
	"created_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_org_slug_unique" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "coznt"."plans" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"parent_plan_id" text,
	"title" text NOT NULL,
	"summary" text,
	"body" text DEFAULT '' NOT NULL,
	"details" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"priority" text,
	"effort_estimate" text,
	"due_date" timestamp,
	"external_ref" text,
	"assignee_id" text,
	"assignee_name" text,
	"approved_by_id" text,
	"approved_at" timestamp,
	"created_by_id" text,
	"created_by_name" text,
	"updated_by_id" text,
	"updated_by_name" text,
	"ai_authored" boolean DEFAULT false NOT NULL,
	"generated_by_model" text,
	"generated_by_skill_id" text,
	"autonomy_at_generation" integer,
	"prompt_hash" text,
	"generated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."plan_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"revision_number" integer NOT NULL,
	"body" text NOT NULL,
	"details" jsonb,
	"change_note" text,
	"created_by_id" text,
	"created_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plan_revisions_plan_revision_unique" UNIQUE("plan_id","revision_number")
);
--> statement-breakpoint
CREATE TABLE "coznt"."rules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"tags" text[],
	"phase" text,
	"severity" text DEFAULT 'warn' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."skills" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"body" text NOT NULL,
	"input_schema" jsonb,
	"output_schema" jsonb,
	"tags" text[],
	"enabled" boolean DEFAULT true NOT NULL,
	"min_autonomy_level" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."skill_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"skill_id" text,
	"project_id" text,
	"invocation_id" text,
	"verdict" text,
	"severity" text,
	"source_kind" text,
	"source_ref" text,
	"rationale" text,
	"prompt_log_id" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."skill_autonomy" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"project_id" text,
	"level" integer DEFAULT 0 NOT NULL,
	"level_set_at" timestamp DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp,
	"next_review_at" timestamp,
	"last_reason" text,
	CONSTRAINT "skill_autonomy_skill_project_unique" UNIQUE NULLS NOT DISTINCT("skill_id","project_id")
);
--> statement-breakpoint
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
CREATE TABLE "coznt"."approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"project_id" text,
	"phase" text,
	"requested_by_id" text NOT NULL,
	"requested_by_name" text,
	"requester_note" text,
	"approver_ids" text[],
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_id" text,
	"decided_by_name" text,
	"decision_note" text,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."comments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"parent_comment_id" text,
	"author_id" text NOT NULL,
	"author_name" text,
	"body" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."work_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"plan_id" text,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"external_url" text,
	"kind" text,
	"title" text NOT NULL,
	"description" text,
	"status" text,
	"assignee_email" text,
	"raw" jsonb,
	"last_synced_at" timestamp,
	"ai_authored" boolean DEFAULT false NOT NULL,
	"generated_by_model" text,
	"generated_by_skill_id" text,
	"autonomy_at_generation" integer,
	"prompt_hash" text,
	"generated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "work_items_source_external_unique" UNIQUE("source","external_id")
);
--> statement-breakpoint
CREATE TABLE "coznt"."webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"processing_error" text,
	CONSTRAINT "webhook_events_source_external_unique" UNIQUE("source","external_id")
);
--> statement-breakpoint
CREATE TABLE "coznt"."audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"summary" text,
	"before" jsonb,
	"after" jsonb,
	"row_hash" text,
	"prev_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."intelligence" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"kind" text NOT NULL,
	"summary" text,
	"body" text,
	"data" jsonb,
	"model_id" text,
	"evaluation_count" integer DEFAULT 0 NOT NULL,
	"last_run_id" text,
	"last_evaluated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "intelligence_entity_kind_unique" UNIQUE("entity_type","entity_id","kind")
);
--> statement-breakpoint
CREATE TABLE "coznt"."notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"channel" text DEFAULT 'in_app' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"link" text,
	"entity_type" text,
	"entity_id" text,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"summary" text,
	"actor_id" text,
	"entity_type" text,
	"entity_id" text,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_by_id" text,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "coznt"."phase_gates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"phase" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"threshold" double precision,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by_id" text,
	"comment" text,
	"evaluated_at" timestamp,
	"unmet_criterion" text,
	"assignee_id" text,
	"assignee_name" text,
	"last_changed_at" timestamp,
	"last_green_at" timestamp,
	"overridden_at" timestamp,
	"overridden_by_id" text,
	"override_reason" text,
	"override_authorizing_plan_id" text,
	"override_autonomy_at_time" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "phase_gates_project_phase_name_unique" UNIQUE("project_id","phase","name")
);
--> statement-breakpoint
CREATE TABLE "coznt"."metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"type" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text,
	"metadata" jsonb,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."deployments" (
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
CREATE TABLE "coznt"."test_runs" (
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
CREATE TABLE "coznt"."adapter_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_key" text NOT NULL,
	"config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "adapter_bindings_org_provider_key_unique" UNIQUE("organization_id","provider","external_key")
);
--> statement-breakpoint
CREATE TABLE "coznt"."gate_evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"pr_ref" text NOT NULL,
	"pr_title" text,
	"pr_head_sha" text,
	"skill_id" text,
	"autonomy_at_eval" text,
	"verdict" text NOT NULL,
	"reason" text NOT NULL,
	"details" jsonb,
	"change_risk" text NOT NULL,
	"human_override" boolean DEFAULT false NOT NULL,
	"check_run_id" text,
	"check_run_error" text,
	"evaluated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."project_learnings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"body" text NOT NULL,
	"pin_order" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by_id" text,
	"created_by_name" text
);
--> statement-breakpoint
CREATE TABLE "coznt"."repo_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"remote_canonical" text NOT NULL,
	"policy" text DEFAULT 'read-write' NOT NULL,
	"project_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" text,
	"created_by_name" text,
	"updated_by_id" text,
	"updated_by_name" text
);
--> statement-breakpoint
CREATE TABLE "coznt"."custom_choreographies" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" text,
	"created_by_name" text,
	"updated_by_id" text,
	"updated_by_name" text
);
--> statement-breakpoint
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
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."invitation" ADD CONSTRAINT "invitation_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."invitation" ADD CONSTRAINT "invitation_inviterId_user_id_fk" FOREIGN KEY ("inviterId") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."plans" ADD CONSTRAINT "plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."plans" ADD CONSTRAINT "plans_generated_by_skill_id_skills_id_fk" FOREIGN KEY ("generated_by_skill_id") REFERENCES "coznt"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."plan_revisions" ADD CONSTRAINT "plan_revisions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "coznt"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."rules" ADD CONSTRAINT "rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skills" ADD CONSTRAINT "skills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skill_outcomes" ADD CONSTRAINT "skill_outcomes_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "coznt"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skill_outcomes" ADD CONSTRAINT "skill_outcomes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skill_autonomy" ADD CONSTRAINT "skill_autonomy_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "coznt"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skill_autonomy" ADD CONSTRAINT "skill_autonomy_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skill_autonomy_events" ADD CONSTRAINT "skill_autonomy_events_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "coznt"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skill_autonomy_events" ADD CONSTRAINT "skill_autonomy_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."approvals" ADD CONSTRAINT "approvals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."comments" ADD CONSTRAINT "comments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "coznt"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."work_items" ADD CONSTRAINT "work_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."work_items" ADD CONSTRAINT "work_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "coznt"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."work_items" ADD CONSTRAINT "work_items_generated_by_skill_id_skills_id_fk" FOREIGN KEY ("generated_by_skill_id") REFERENCES "coznt"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."intelligence" ADD CONSTRAINT "intelligence_last_run_id_automation_logs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "coznt"."automation_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."phase_gates" ADD CONSTRAINT "phase_gates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."phase_gates" ADD CONSTRAINT "phase_gates_override_authorizing_plan_id_plans_id_fk" FOREIGN KEY ("override_authorizing_plan_id") REFERENCES "coznt"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."metrics" ADD CONSTRAINT "metrics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."deployments" ADD CONSTRAINT "deployments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."deployments" ADD CONSTRAINT "deployments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "coznt"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."test_runs" ADD CONSTRAINT "test_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."test_runs" ADD CONSTRAINT "test_runs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "coznt"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."adapter_bindings" ADD CONSTRAINT "adapter_bindings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."gate_evaluations" ADD CONSTRAINT "gate_evaluations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."gate_evaluations" ADD CONSTRAINT "gate_evaluations_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "coznt"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."project_learnings" ADD CONSTRAINT "project_learnings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."repo_policies" ADD CONSTRAINT "repo_policies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."custom_choreographies" ADD CONSTRAINT "custom_choreographies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."prompt_logs" ADD CONSTRAINT "prompt_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coznt_documents_org_idx" ON "coznt"."documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "coznt_documents_table_idx" ON "coznt"."documents" USING btree ("table_name");--> statement-breakpoint
CREATE INDEX "coznt_documents_embedding_idx" ON "coznt"."documents" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "integration_credentials_org_idx" ON "coznt"."integration_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "oauth_connections_organization_id_idx" ON "coznt"."oauth_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "oauth_connections_user_id_idx" ON "coznt"."oauth_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_connections_provider_idx" ON "coznt"."oauth_connections" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "oauth_connections_category_idx" ON "coznt"."oauth_connections" USING btree ("category");--> statement-breakpoint
CREATE INDEX "oauth_connections_status_idx" ON "coznt"."oauth_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "automation_logs_task_entity_status_idx" ON "coznt"."automation_logs" USING btree ("task_id","entity_id","status","created_at");--> statement-breakpoint
CREATE INDEX "automation_logs_entity_activity_idx" ON "coznt"."automation_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_logs_output_ref_idx" ON "coznt"."automation_logs" USING btree ("output_table","output_id");--> statement-breakpoint
CREATE INDEX "automation_logs_trace_idx" ON "coznt"."automation_logs" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "coznt_rate_limits_window_idx" ON "coznt"."rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "coznt"."projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "projects_fts_idx" ON "coznt"."projects" USING gin (coznt.fts_vector("name", "description"));--> statement-breakpoint
CREATE INDEX "plans_org_idx" ON "coznt"."plans" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "plans_project_idx" ON "coznt"."plans" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "plans_parent_idx" ON "coznt"."plans" USING btree ("parent_plan_id");--> statement-breakpoint
CREATE INDEX "plans_kind_status_idx" ON "coznt"."plans" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "plans_generated_by_skill_idx" ON "coznt"."plans" USING btree ("generated_by_skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_project_kind_slug_idx" ON "coznt"."plans" USING btree ("project_id","kind","slug");--> statement-breakpoint
CREATE INDEX "plans_fts_idx" ON "coznt"."plans" USING gin (coznt.fts_vector("title", "summary", "body"));--> statement-breakpoint
CREATE INDEX "plan_revisions_plan_idx" ON "coznt"."plan_revisions" USING btree ("plan_id","revision_number");--> statement-breakpoint
CREATE INDEX "rules_org_idx" ON "coznt"."rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rules_project_idx" ON "coznt"."rules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "rules_phase_idx" ON "coznt"."rules" USING btree ("phase");--> statement-breakpoint
CREATE INDEX "rules_fts_idx" ON "coznt"."rules" USING gin (coznt.fts_vector("title", "body"));--> statement-breakpoint
CREATE INDEX "skills_org_idx" ON "coznt"."skills" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "skills_project_idx" ON "coznt"."skills" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "skills_fts_idx" ON "coznt"."skills" USING gin (coznt.fts_vector("name", "description", "body"));--> statement-breakpoint
CREATE INDEX "skill_outcomes_skill_time_idx" ON "coznt"."skill_outcomes" USING btree ("skill_id","recorded_at");--> statement-breakpoint
CREATE INDEX "skill_outcomes_org_time_idx" ON "coznt"."skill_outcomes" USING btree ("organization_id","recorded_at");--> statement-breakpoint
CREATE INDEX "skill_outcomes_project_skill_time_idx" ON "coznt"."skill_outcomes" USING btree ("project_id","skill_id","recorded_at");--> statement-breakpoint
CREATE INDEX "skill_outcomes_project_kind_time_idx" ON "coznt"."skill_outcomes" USING btree ("project_id","source_kind","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_outcomes_source_unique_idx" ON "coznt"."skill_outcomes" USING btree ("skill_id","source_kind","source_ref") WHERE "coznt"."skill_outcomes"."source_ref" is not null;--> statement-breakpoint
CREATE INDEX "skill_autonomy_skill_idx" ON "coznt"."skill_autonomy" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_autonomy_project_idx" ON "coznt"."skill_autonomy" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "skill_autonomy_events_skill_time_idx" ON "coznt"."skill_autonomy_events" USING btree ("skill_id","created_at");--> statement-breakpoint
CREATE INDEX "skill_autonomy_events_project_time_idx" ON "coznt"."skill_autonomy_events" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "skill_autonomy_events_org_time_idx" ON "coznt"."skill_autonomy_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "approvals_entity_idx" ON "coznt"."approvals" USING btree ("entity_type","entity_id","status");--> statement-breakpoint
CREATE INDEX "approvals_org_idx" ON "coznt"."approvals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "approvals_project_status_idx" ON "coznt"."approvals" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "comments_plan_idx" ON "coznt"."comments" USING btree ("plan_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_org_idx" ON "coznt"."comments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "comments_fts_idx" ON "coznt"."comments" USING gin (coznt.fts_vector("body"));--> statement-breakpoint
CREATE INDEX "work_items_org_idx" ON "coznt"."work_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "work_items_project_idx" ON "coznt"."work_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "work_items_plan_idx" ON "coznt"."work_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "work_items_generated_by_skill_idx" ON "coznt"."work_items" USING btree ("generated_by_skill_id");--> statement-breakpoint
CREATE INDEX "work_items_fts_idx" ON "coznt"."work_items" USING gin (coznt.fts_vector("title", "description"));--> statement-breakpoint
CREATE INDEX "webhook_events_unprocessed_idx" ON "coznt"."webhook_events" USING btree ("source","processed_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "coznt"."audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_org_idx" ON "coznt"."audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "intelligence_entity_idx" ON "coznt"."intelligence" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "intelligence_org_idx" ON "coznt"."intelligence" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "intelligence_fts_idx" ON "coznt"."intelligence" USING gin (coznt.fts_vector("summary", "body"));--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "coznt"."notifications" USING btree ("recipient_id","read","created_at");--> statement-breakpoint
CREATE INDEX "notifications_org_idx" ON "coznt"."notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "events_org_kind_idx" ON "coznt"."events" USING btree ("organization_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "events_entity_idx" ON "coznt"."events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "coznt"."api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "coznt"."api_keys" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "phase_gates_project_phase_idx" ON "coznt"."phase_gates" USING btree ("project_id","phase","status");--> statement-breakpoint
CREATE INDEX "metrics_project_type_time_idx" ON "coznt"."metrics" USING btree ("project_id","type","recorded_at");--> statement-breakpoint
CREATE INDEX "metrics_org_time_idx" ON "coznt"."metrics" USING btree ("organization_id","recorded_at");--> statement-breakpoint
CREATE INDEX "deployments_project_env_time_idx" ON "coznt"."deployments" USING btree ("project_id","environment","started_at");--> statement-breakpoint
CREATE INDEX "deployments_project_status_idx" ON "coznt"."deployments" USING btree ("project_id","status","started_at");--> statement-breakpoint
CREATE INDEX "deployments_plan_idx" ON "coznt"."deployments" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "test_runs_project_time_idx" ON "coznt"."test_runs" USING btree ("project_id","ran_at");--> statement-breakpoint
CREATE INDEX "test_runs_project_status_idx" ON "coznt"."test_runs" USING btree ("project_id","status","ran_at");--> statement-breakpoint
CREATE INDEX "test_runs_plan_idx" ON "coznt"."test_runs" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "adapter_bindings_org_idx" ON "coznt"."adapter_bindings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "adapter_bindings_project_idx" ON "coznt"."adapter_bindings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "gate_evaluations_project_pr_idx" ON "coznt"."gate_evaluations" USING btree ("project_id","pr_ref","evaluated_at");--> statement-breakpoint
CREATE INDEX "gate_evaluations_skill_idx" ON "coznt"."gate_evaluations" USING btree ("skill_id","verdict","evaluated_at");--> statement-breakpoint
CREATE INDEX "gate_evaluations_org_idx" ON "coznt"."gate_evaluations" USING btree ("organization_id","evaluated_at");--> statement-breakpoint
CREATE INDEX "project_learnings_project_idx" ON "coznt"."project_learnings" USING btree ("project_id","pin_order","created_at");--> statement-breakpoint
CREATE INDEX "project_learnings_org_idx" ON "coznt"."project_learnings" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_policies_org_remote_uniq" ON "coznt"."repo_policies" USING btree ("organization_id","remote_canonical");--> statement-breakpoint
CREATE INDEX "repo_policies_org_idx" ON "coznt"."repo_policies" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_choreographies_org_slug_uniq" ON "coznt"."custom_choreographies" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "custom_choreographies_project_idx" ON "coznt"."custom_choreographies" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "custom_choreographies_org_idx" ON "coznt"."custom_choreographies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "prompt_logs_project_time_idx" ON "coznt"."prompt_logs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "prompt_logs_project_tier_idx" ON "coznt"."prompt_logs" USING btree ("project_id","prompt_tier");--> statement-breakpoint
CREATE INDEX "prompt_logs_session_idx" ON "coznt"."prompt_logs" USING btree ("mcp_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_logs_client_local_unique" ON "coznt"."prompt_logs" USING btree ("project_id","client_local_id") WHERE "coznt"."prompt_logs"."client_local_id" is not null;--> statement-breakpoint
CREATE INDEX "prompt_logs_fts_idx" ON "coznt"."prompt_logs" USING gin (coznt.fts_vector("content"));