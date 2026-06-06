ALTER TABLE "coznt"."projects" ADD COLUMN "approval_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "coznt"."phase_gates" ADD COLUMN "linked_entity_type" text;--> statement-breakpoint
ALTER TABLE "coznt"."phase_gates" ADD COLUMN "linked_entity_id" text;--> statement-breakpoint
CREATE INDEX "phase_gates_linked_entity_idx" ON "coznt"."phase_gates" USING btree ("linked_entity_type","linked_entity_id");