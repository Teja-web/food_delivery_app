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
	"status" text DEFAULT 'active' NOT NULL,
	"default_approver_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"critical_paths" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"production_critical_paths" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"require_human_approval_for_merge" boolean DEFAULT false NOT NULL,
	"autonomy_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" text,
	"created_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_org_slug_unique" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "coznt"."repositories" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"source" text NOT NULL,
	"identifier" text NOT NULL,
	"url" text,
	"default_branch" text,
	"metadata" jsonb,
	"branch_policy" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_project_source_identifier_unique" UNIQUE("project_id","source","identifier")
);
--> statement-breakpoint
CREATE TABLE "coznt"."environments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"tier" text,
	"url" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "environments_project_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "coznt"."plan_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body" text DEFAULT '' NOT NULL,
	"details" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"priority" text,
	"effort_estimate" text,
	"due_date" timestamp,
	"classifications" text[],
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
CREATE TABLE "coznt"."plan_relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"from_plan_artifact_id" text NOT NULL,
	"to_plan_artifact_id" text NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."plan_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_artifact_id" text NOT NULL,
	"revision_number" integer NOT NULL,
	"body" text NOT NULL,
	"details" jsonb,
	"change_note" text,
	"created_by_id" text,
	"created_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plan_revisions_plan_artifact_revision_unique" UNIQUE("plan_artifact_id","revision_number")
);
--> statement-breakpoint
CREATE TABLE "coznt"."comments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_artifact_id" text NOT NULL,
	"parent_comment_id" text,
	"author_id" text NOT NULL,
	"author_name" text,
	"body" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "coznt"."work_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"plan_artifact_id" text,
	"repository_id" text,
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
	"invoked_via" text,
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
CREATE TABLE "coznt"."governance_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text,
	"applies_to_plan_kind" text,
	"transition_from" text,
	"transition_to" text,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"details" jsonb,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."governance_records" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"plan_artifact_id" text NOT NULL,
	"policy_id" text,
	"kind" text NOT NULL,
	"transition_from" text,
	"transition_to" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_id" text,
	"decided_by_name" text,
	"decision_note" text,
	"decided_at" timestamp,
	"details" jsonb,
	"policy_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."evidence_links" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"plan_artifact_id" text NOT NULL,
	"evidence_type" text NOT NULL,
	"evidence_id" text,
	"external_url" text,
	"role" text,
	"note" text,
	"attached_by_id" text,
	"attached_by_name" text,
	"attached_at" timestamp DEFAULT now() NOT NULL
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
	"plan_artifact_id" text,
	"environment_id" text,
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
	"plan_artifact_id" text,
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
ALTER TABLE "coznt"."repositories" ADD CONSTRAINT "repositories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."environments" ADD CONSTRAINT "environments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."plan_artifacts" ADD CONSTRAINT "plan_artifacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."plan_artifacts" ADD CONSTRAINT "plan_artifacts_generated_by_skill_id_skills_id_fk" FOREIGN KEY ("generated_by_skill_id") REFERENCES "coznt"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."plan_relationships" ADD CONSTRAINT "plan_relationships_from_plan_artifact_id_plan_artifacts_id_fk" FOREIGN KEY ("from_plan_artifact_id") REFERENCES "coznt"."plan_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."plan_relationships" ADD CONSTRAINT "plan_relationships_to_plan_artifact_id_plan_artifacts_id_fk" FOREIGN KEY ("to_plan_artifact_id") REFERENCES "coznt"."plan_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."plan_revisions" ADD CONSTRAINT "plan_revisions_plan_artifact_id_plan_artifacts_id_fk" FOREIGN KEY ("plan_artifact_id") REFERENCES "coznt"."plan_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."comments" ADD CONSTRAINT "comments_plan_artifact_id_plan_artifacts_id_fk" FOREIGN KEY ("plan_artifact_id") REFERENCES "coznt"."plan_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."rules" ADD CONSTRAINT "rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skills" ADD CONSTRAINT "skills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skill_outcomes" ADD CONSTRAINT "skill_outcomes_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "coznt"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skill_outcomes" ADD CONSTRAINT "skill_outcomes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skill_autonomy" ADD CONSTRAINT "skill_autonomy_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "coznt"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skill_autonomy" ADD CONSTRAINT "skill_autonomy_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skill_autonomy_events" ADD CONSTRAINT "skill_autonomy_events_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "coznt"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."skill_autonomy_events" ADD CONSTRAINT "skill_autonomy_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."work_items" ADD CONSTRAINT "work_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."work_items" ADD CONSTRAINT "work_items_plan_artifact_id_plan_artifacts_id_fk" FOREIGN KEY ("plan_artifact_id") REFERENCES "coznt"."plan_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."work_items" ADD CONSTRAINT "work_items_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "coznt"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."work_items" ADD CONSTRAINT "work_items_generated_by_skill_id_skills_id_fk" FOREIGN KEY ("generated_by_skill_id") REFERENCES "coznt"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."intelligence" ADD CONSTRAINT "intelligence_last_run_id_automation_logs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "coznt"."automation_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."governance_records" ADD CONSTRAINT "governance_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."governance_records" ADD CONSTRAINT "governance_records_plan_artifact_id_plan_artifacts_id_fk" FOREIGN KEY ("plan_artifact_id") REFERENCES "coznt"."plan_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."governance_records" ADD CONSTRAINT "governance_records_policy_id_governance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "coznt"."governance_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."evidence_links" ADD CONSTRAINT "evidence_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."evidence_links" ADD CONSTRAINT "evidence_links_plan_artifact_id_plan_artifacts_id_fk" FOREIGN KEY ("plan_artifact_id") REFERENCES "coznt"."plan_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."metrics" ADD CONSTRAINT "metrics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."deployments" ADD CONSTRAINT "deployments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."deployments" ADD CONSTRAINT "deployments_plan_artifact_id_plan_artifacts_id_fk" FOREIGN KEY ("plan_artifact_id") REFERENCES "coznt"."plan_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."deployments" ADD CONSTRAINT "deployments_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "coznt"."environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."test_runs" ADD CONSTRAINT "test_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."test_runs" ADD CONSTRAINT "test_runs_plan_artifact_id_plan_artifacts_id_fk" FOREIGN KEY ("plan_artifact_id") REFERENCES "coznt"."plan_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."adapter_bindings" ADD CONSTRAINT "adapter_bindings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coznt"."project_learnings" ADD CONSTRAINT "project_learnings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "repositories_project_idx" ON "coznt"."repositories" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "repositories_org_idx" ON "coznt"."repositories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "environments_project_idx" ON "coznt"."environments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "environments_org_idx" ON "coznt"."environments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "plan_artifacts_org_idx" ON "coznt"."plan_artifacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "plan_artifacts_project_status_idx" ON "coznt"."plan_artifacts" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "plan_artifacts_kind_status_idx" ON "coznt"."plan_artifacts" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "plan_artifacts_generated_by_skill_idx" ON "coznt"."plan_artifacts" USING btree ("generated_by_skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_artifacts_project_kind_slug_idx" ON "coznt"."plan_artifacts" USING btree ("project_id","kind","slug");--> statement-breakpoint
CREATE INDEX "plan_artifacts_fts_idx" ON "coznt"."plan_artifacts" USING gin (coznt.fts_vector("title", "summary", "body"));--> statement-breakpoint
CREATE INDEX "plan_rel_from_idx" ON "coznt"."plan_relationships" USING btree ("from_plan_artifact_id","kind");--> statement-breakpoint
CREATE INDEX "plan_rel_to_idx" ON "coznt"."plan_relationships" USING btree ("to_plan_artifact_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_rel_unique" ON "coznt"."plan_relationships" USING btree ("from_plan_artifact_id","to_plan_artifact_id","kind");--> statement-breakpoint
CREATE INDEX "plan_revisions_plan_artifact_idx" ON "coznt"."plan_revisions" USING btree ("plan_artifact_id","revision_number");--> statement-breakpoint
CREATE INDEX "comments_plan_artifact_idx" ON "coznt"."comments" USING btree ("plan_artifact_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_org_idx" ON "coznt"."comments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "comments_fts_idx" ON "coznt"."comments" USING gin (coznt.fts_vector("body"));--> statement-breakpoint
CREATE INDEX "rules_org_idx" ON "coznt"."rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rules_project_idx" ON "coznt"."rules" USING btree ("project_id");--> statement-breakpoint
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
CREATE INDEX "work_items_org_idx" ON "coznt"."work_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "work_items_project_idx" ON "coznt"."work_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "work_items_plan_artifact_idx" ON "coznt"."work_items" USING btree ("plan_artifact_id");--> statement-breakpoint
CREATE INDEX "work_items_repository_idx" ON "coznt"."work_items" USING btree ("repository_id");--> statement-breakpoint
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
CREATE INDEX "gov_policies_org_idx" ON "coznt"."governance_policies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "gov_policies_scope_idx" ON "coznt"."governance_policies" USING btree ("scope_type","scope_id","enabled");--> statement-breakpoint
CREATE INDEX "gov_policies_kind_applies_idx" ON "coznt"."governance_policies" USING btree ("kind","applies_to_plan_kind","transition_from","transition_to");--> statement-breakpoint
CREATE INDEX "gov_records_org_idx" ON "coznt"."governance_records" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "gov_records_plan_idx" ON "coznt"."governance_records" USING btree ("plan_artifact_id","kind","status");--> statement-breakpoint
CREATE INDEX "gov_records_project_status_idx" ON "coznt"."governance_records" USING btree ("project_id","status","kind");--> statement-breakpoint
CREATE INDEX "gov_records_policy_idx" ON "coznt"."governance_records" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "evidence_plan_idx" ON "coznt"."evidence_links" USING btree ("plan_artifact_id","evidence_type");--> statement-breakpoint
CREATE INDEX "evidence_target_idx" ON "coznt"."evidence_links" USING btree ("evidence_type","evidence_id");--> statement-breakpoint
CREATE INDEX "evidence_project_idx" ON "coznt"."evidence_links" USING btree ("project_id","evidence_type");--> statement-breakpoint
CREATE INDEX "metrics_project_type_time_idx" ON "coznt"."metrics" USING btree ("project_id","type","recorded_at");--> statement-breakpoint
CREATE INDEX "metrics_org_time_idx" ON "coznt"."metrics" USING btree ("organization_id","recorded_at");--> statement-breakpoint
CREATE INDEX "deployments_project_env_time_idx" ON "coznt"."deployments" USING btree ("project_id","environment","started_at");--> statement-breakpoint
CREATE INDEX "deployments_project_status_idx" ON "coznt"."deployments" USING btree ("project_id","status","started_at");--> statement-breakpoint
CREATE INDEX "deployments_plan_artifact_idx" ON "coznt"."deployments" USING btree ("plan_artifact_id");--> statement-breakpoint
CREATE INDEX "deployments_environment_idx" ON "coznt"."deployments" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "test_runs_project_time_idx" ON "coznt"."test_runs" USING btree ("project_id","ran_at");--> statement-breakpoint
CREATE INDEX "test_runs_project_status_idx" ON "coznt"."test_runs" USING btree ("project_id","status","ran_at");--> statement-breakpoint
CREATE INDEX "test_runs_plan_artifact_idx" ON "coznt"."test_runs" USING btree ("plan_artifact_id");--> statement-breakpoint
CREATE INDEX "adapter_bindings_org_idx" ON "coznt"."adapter_bindings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "adapter_bindings_project_idx" ON "coznt"."adapter_bindings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_learnings_project_idx" ON "coznt"."project_learnings" USING btree ("project_id","pin_order","created_at");--> statement-breakpoint
CREATE INDEX "project_learnings_org_idx" ON "coznt"."project_learnings" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_choreographies_org_slug_uniq" ON "coznt"."custom_choreographies" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "custom_choreographies_project_idx" ON "coznt"."custom_choreographies" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "custom_choreographies_org_idx" ON "coznt"."custom_choreographies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "prompt_logs_project_time_idx" ON "coznt"."prompt_logs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "prompt_logs_project_tier_idx" ON "coznt"."prompt_logs" USING btree ("project_id","prompt_tier");--> statement-breakpoint
CREATE INDEX "prompt_logs_session_idx" ON "coznt"."prompt_logs" USING btree ("mcp_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_logs_client_local_unique" ON "coznt"."prompt_logs" USING btree ("project_id","client_local_id") WHERE "coznt"."prompt_logs"."client_local_id" is not null;--> statement-breakpoint
CREATE INDEX "prompt_logs_fts_idx" ON "coznt"."prompt_logs" USING gin (coznt.fts_vector("content"));