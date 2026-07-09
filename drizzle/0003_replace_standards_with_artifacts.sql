CREATE TABLE "coznt"."organization_artifacts" (
	"id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"summary" text,
	"type" text NOT NULL,
	"category" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creator_id" text,
	"creator_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coznt"."project_artifacts" (
	"id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"summary" text,
	"type" text NOT NULL,
	"category" text,
	"created_via" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creator_id" text,
	"creator_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coznt"."organization_artifacts" ADD CONSTRAINT "organization_artifacts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coznt"."project_artifacts" ADD CONSTRAINT "project_artifacts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coznt"."project_artifacts" ADD CONSTRAINT "project_artifacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "coznt"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "organization_artifacts_org_idx" ON "coznt"."organization_artifacts" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "organization_artifacts_type_idx" ON "coznt"."organization_artifacts" USING btree ("type");
--> statement-breakpoint
CREATE INDEX "organization_artifacts_category_idx" ON "coznt"."organization_artifacts" USING btree ("organization_id","category");
--> statement-breakpoint
CREATE INDEX "organization_artifacts_fts_idx" ON "coznt"."organization_artifacts" USING gin (coznt.fts_vector("name", "body"));
--> statement-breakpoint
CREATE INDEX "project_artifacts_org_idx" ON "coznt"."project_artifacts" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "project_artifacts_project_idx" ON "coznt"."project_artifacts" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "project_artifacts_type_idx" ON "coznt"."project_artifacts" USING btree ("type");
--> statement-breakpoint
CREATE INDEX "project_artifacts_category_idx" ON "coznt"."project_artifacts" USING btree ("organization_id","project_id","category");
--> statement-breakpoint
CREATE INDEX "project_artifacts_fts_idx" ON "coznt"."project_artifacts" USING gin (coznt.fts_vector("name", "body"));
--> statement-breakpoint
DROP TABLE "coznt"."standards";
