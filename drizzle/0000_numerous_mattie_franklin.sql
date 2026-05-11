CREATE SCHEMA "dilliznt";
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
CREATE TABLE "dilliznt"."departments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"lead_user_id" text,
	"lead_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "departments_org_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "dilliznt"."org_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"raw_text" text,
	"uploaded_documents" jsonb,
	"extracted_identity" jsonb,
	"extracted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "org_identities_org_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "dilliznt"."documents" (
	"id" text PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"content" text,
	"embedding" vector(1536),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recruit_documents_table_record_uniq" UNIQUE("table_name","record_id")
);
--> statement-breakpoint
CREATE TABLE "dilliznt"."integration_credentials" (
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
CREATE TABLE "dilliznt"."oauth_connections" (
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
CREATE TABLE "dilliznt"."automation_logs" (
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
CREATE TABLE "dilliznt"."entity_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" text,
	"created_by_name" text,
	"updated_by_id" text,
	"updated_by_name" text
);
--> statement-breakpoint
CREATE TABLE "dilliznt"."rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dilliznt"."projects" (
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
	"created_by_id" text,
	"created_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_org_slug_unique" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "dilliznt"."plans" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"slug" text,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dilliznt"."plan_revisions" (
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
CREATE TABLE "dilliznt"."rules" (
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
CREATE TABLE "dilliznt"."skills" (
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
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dilliznt"."approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
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
CREATE TABLE "dilliznt"."comments" (
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
CREATE TABLE "dilliznt"."work_items" (
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "work_items_source_external_unique" UNIQUE("source","external_id")
);
--> statement-breakpoint
CREATE TABLE "dilliznt"."webhook_events" (
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
CREATE TABLE "dilliznt"."audit_logs" (
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
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dilliznt"."intelligence" (
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
CREATE TABLE "dilliznt"."notifications" (
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
CREATE TABLE "dilliznt"."events" (
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
CREATE TABLE "dilliznt"."api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_by_id" text,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "dilliznt"."phase_gates" (
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "phase_gates_project_phase_name_unique" UNIQUE("project_id","phase","name")
);
--> statement-breakpoint
CREATE TABLE "dilliznt"."metrics" (
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
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."invitation" ADD CONSTRAINT "invitation_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."invitation" ADD CONSTRAINT "invitation_inviterId_user_id_fk" FOREIGN KEY ("inviterId") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."plans" ADD CONSTRAINT "plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "dilliznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."plan_revisions" ADD CONSTRAINT "plan_revisions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dilliznt"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."rules" ADD CONSTRAINT "rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "dilliznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."skills" ADD CONSTRAINT "skills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "dilliznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."comments" ADD CONSTRAINT "comments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dilliznt"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."work_items" ADD CONSTRAINT "work_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "dilliznt"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."work_items" ADD CONSTRAINT "work_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dilliznt"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."intelligence" ADD CONSTRAINT "intelligence_last_run_id_automation_logs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "dilliznt"."automation_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "dilliznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."phase_gates" ADD CONSTRAINT "phase_gates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "dilliznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilliznt"."metrics" ADD CONSTRAINT "metrics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "dilliznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "departments_org_idx" ON "dilliznt"."departments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "departments_fts_idx" ON "dilliznt"."departments" USING gin (dilliznt.fts_vector("name", "description"));--> statement-breakpoint
CREATE INDEX "recruit_documents_org_idx" ON "dilliznt"."documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "recruit_documents_table_idx" ON "dilliznt"."documents" USING btree ("table_name");--> statement-breakpoint
CREATE INDEX "recruit_documents_embedding_idx" ON "dilliznt"."documents" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "integration_credentials_org_idx" ON "dilliznt"."integration_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "oauth_connections_organization_id_idx" ON "dilliznt"."oauth_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "oauth_connections_user_id_idx" ON "dilliznt"."oauth_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_connections_provider_idx" ON "dilliznt"."oauth_connections" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "oauth_connections_category_idx" ON "dilliznt"."oauth_connections" USING btree ("category");--> statement-breakpoint
CREATE INDEX "oauth_connections_status_idx" ON "dilliznt"."oauth_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "automation_logs_task_entity_status_idx" ON "dilliznt"."automation_logs" USING btree ("task_id","entity_id","status","created_at");--> statement-breakpoint
CREATE INDEX "automation_logs_entity_activity_idx" ON "dilliznt"."automation_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_logs_output_ref_idx" ON "dilliznt"."automation_logs" USING btree ("output_table","output_id");--> statement-breakpoint
CREATE INDEX "automation_logs_trace_idx" ON "dilliznt"."automation_logs" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "recruit_entity_notes_entity_idx" ON "dilliznt"."entity_notes" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "recruit_entity_notes_org_idx" ON "dilliznt"."entity_notes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "recruit_rate_limits_window_idx" ON "dilliznt"."rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "dilliznt"."projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "projects_fts_idx" ON "dilliznt"."projects" USING gin (dilliznt.fts_vector("name", "description"));--> statement-breakpoint
CREATE INDEX "plans_org_idx" ON "dilliznt"."plans" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "plans_project_idx" ON "dilliznt"."plans" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "plans_kind_status_idx" ON "dilliznt"."plans" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "plans_fts_idx" ON "dilliznt"."plans" USING gin (dilliznt.fts_vector("title", "summary", "body"));--> statement-breakpoint
CREATE INDEX "plan_revisions_plan_idx" ON "dilliznt"."plan_revisions" USING btree ("plan_id","revision_number");--> statement-breakpoint
CREATE INDEX "rules_org_idx" ON "dilliznt"."rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rules_project_idx" ON "dilliznt"."rules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "rules_phase_idx" ON "dilliznt"."rules" USING btree ("phase");--> statement-breakpoint
CREATE INDEX "rules_fts_idx" ON "dilliznt"."rules" USING gin (dilliznt.fts_vector("title", "body"));--> statement-breakpoint
CREATE INDEX "skills_org_idx" ON "dilliznt"."skills" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "skills_project_idx" ON "dilliznt"."skills" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "skills_fts_idx" ON "dilliznt"."skills" USING gin (dilliznt.fts_vector("name", "description", "body"));--> statement-breakpoint
CREATE INDEX "approvals_entity_idx" ON "dilliznt"."approvals" USING btree ("entity_type","entity_id","status");--> statement-breakpoint
CREATE INDEX "approvals_org_idx" ON "dilliznt"."approvals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "comments_plan_idx" ON "dilliznt"."comments" USING btree ("plan_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_org_idx" ON "dilliznt"."comments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "comments_fts_idx" ON "dilliznt"."comments" USING gin (dilliznt.fts_vector("body"));--> statement-breakpoint
CREATE INDEX "work_items_org_idx" ON "dilliznt"."work_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "work_items_project_idx" ON "dilliznt"."work_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "work_items_plan_idx" ON "dilliznt"."work_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "work_items_fts_idx" ON "dilliznt"."work_items" USING gin (dilliznt.fts_vector("title", "description"));--> statement-breakpoint
CREATE INDEX "webhook_events_unprocessed_idx" ON "dilliznt"."webhook_events" USING btree ("source","processed_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "dilliznt"."audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_org_idx" ON "dilliznt"."audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "intelligence_entity_idx" ON "dilliznt"."intelligence" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "intelligence_org_idx" ON "dilliznt"."intelligence" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "intelligence_fts_idx" ON "dilliznt"."intelligence" USING gin (dilliznt.fts_vector("summary", "body"));--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "dilliznt"."notifications" USING btree ("recipient_id","read","created_at");--> statement-breakpoint
CREATE INDEX "notifications_org_idx" ON "dilliznt"."notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "events_org_kind_idx" ON "dilliznt"."events" USING btree ("organization_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "events_entity_idx" ON "dilliznt"."events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "dilliznt"."api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "dilliznt"."api_keys" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "phase_gates_project_phase_idx" ON "dilliznt"."phase_gates" USING btree ("project_id","phase","status");--> statement-breakpoint
CREATE INDEX "metrics_project_type_time_idx" ON "dilliznt"."metrics" USING btree ("project_id","type","recorded_at");--> statement-breakpoint
CREATE INDEX "metrics_org_time_idx" ON "dilliznt"."metrics" USING btree ("organization_id","recorded_at");