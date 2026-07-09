CREATE TABLE "coznt"."standards" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"format" text DEFAULT 'markdown' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"content_hash" text NOT NULL,
	"source_file_name" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp,
	"created_by_id" text,
	"created_by_name" text,
	"updated_by_id" text,
	"updated_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coznt"."standards" ADD CONSTRAINT "standards_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "standards_org_idx" ON "coznt"."standards" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "standards_project_idx" ON "coznt"."standards" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "standards_kind_idx" ON "coznt"."standards" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "standards_slug_idx" ON "coznt"."standards" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "standards_hash_idx" ON "coznt"."standards" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "standards_fts_idx" ON "coznt"."standards" USING gin (coznt.fts_vector("title", "body"));--> statement-breakpoint
CREATE UNIQUE INDEX "standards_org_required_active_uniq" ON "coznt"."standards" USING btree ("organization_id","kind") WHERE "coznt"."standards"."project_id" is null and "coznt"."standards"."kind" <> 'custom' and "coznt"."standards"."enabled" = true and "coznt"."standards"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "standards_project_required_active_uniq" ON "coznt"."standards" USING btree ("organization_id","project_id","kind") WHERE "coznt"."standards"."project_id" is not null and "coznt"."standards"."kind" <> 'custom' and "coznt"."standards"."enabled" = true and "coznt"."standards"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "standards_org_custom_active_uniq" ON "coznt"."standards" USING btree ("organization_id","slug") WHERE "coznt"."standards"."project_id" is null and "coznt"."standards"."kind" = 'custom' and "coznt"."standards"."enabled" = true and "coznt"."standards"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "standards_project_custom_active_uniq" ON "coznt"."standards" USING btree ("organization_id","project_id","slug") WHERE "coznt"."standards"."project_id" is not null and "coznt"."standards"."kind" = 'custom' and "coznt"."standards"."enabled" = true and "coznt"."standards"."deleted_at" is null;