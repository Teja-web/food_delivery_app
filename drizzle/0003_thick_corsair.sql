CREATE TABLE "dilliznt"."adapter_bindings" (
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
ALTER TABLE "dilliznt"."adapter_bindings" ADD CONSTRAINT "adapter_bindings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "dilliznt"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adapter_bindings_org_idx" ON "dilliznt"."adapter_bindings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "adapter_bindings_project_idx" ON "dilliznt"."adapter_bindings" USING btree ("project_id");