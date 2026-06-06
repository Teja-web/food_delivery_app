ALTER TABLE "coznt"."plans" ADD COLUMN "phase" text;--> statement-breakpoint
CREATE INDEX "plans_project_phase_status_idx" ON "coznt"."plans" USING btree ("project_id","phase","status");