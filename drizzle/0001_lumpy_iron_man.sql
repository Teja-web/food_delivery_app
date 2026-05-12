ALTER TABLE "coznt"."phase_gates" ADD COLUMN "unmet_criterion" text;--> statement-breakpoint
ALTER TABLE "coznt"."phase_gates" ADD COLUMN "assignee_id" text;--> statement-breakpoint
ALTER TABLE "coznt"."phase_gates" ADD COLUMN "assignee_name" text;--> statement-breakpoint
ALTER TABLE "coznt"."phase_gates" ADD COLUMN "last_changed_at" timestamp;--> statement-breakpoint
ALTER TABLE "coznt"."phase_gates" ADD COLUMN "last_green_at" timestamp;