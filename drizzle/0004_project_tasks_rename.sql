ALTER TABLE "coznt"."plan_artifacts" RENAME TO "project_tasks";--> statement-breakpoint
ALTER TABLE "coznt"."project_tasks" RENAME CONSTRAINT "plan_artifacts_pkey" TO "project_tasks_pkey";--> statement-breakpoint
ALTER TABLE "coznt"."project_tasks" RENAME CONSTRAINT "plan_artifacts_project_id_projects_id_fk" TO "project_tasks_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "coznt"."project_tasks" RENAME CONSTRAINT "plan_artifacts_generated_by_skill_id_skills_id_fk" TO "project_tasks_generated_by_skill_id_skills_id_fk";--> statement-breakpoint
ALTER TABLE "coznt"."project_tasks" RENAME COLUMN "details" TO "metadata";--> statement-breakpoint
UPDATE "coznt"."project_tasks"
SET "metadata" = jsonb_strip_nulls(
  COALESCE("metadata", '{}'::jsonb)
  || CASE
    WHEN "effort_estimate" IS NOT NULL THEN jsonb_build_object('effortEstimate', "effort_estimate")
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN "classifications" IS NOT NULL THEN jsonb_build_object('classifications', to_jsonb("classifications"))
    ELSE '{}'::jsonb
  END
);--> statement-breakpoint
UPDATE "coznt"."project_tasks"
SET "metadata" = jsonb_set(
  COALESCE("metadata", '{}'::jsonb),
  '{source}',
  COALESCE("metadata"->'source', '{}'::jsonb) || jsonb_build_object('claimedPath', "claimed_path"),
  true
)
WHERE "claimed_path" IS NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "coznt"."plan_artifacts_claimed_path_idx";--> statement-breakpoint
ALTER INDEX "coznt"."plan_artifacts_org_idx" RENAME TO "project_tasks_org_idx";--> statement-breakpoint
ALTER INDEX "coznt"."plan_artifacts_project_status_idx" RENAME TO "project_tasks_project_status_idx";--> statement-breakpoint
ALTER INDEX "coznt"."plan_artifacts_kind_status_idx" RENAME TO "project_tasks_kind_status_idx";--> statement-breakpoint
ALTER INDEX "coznt"."plan_artifacts_generated_by_skill_idx" RENAME TO "project_tasks_generated_by_skill_idx";--> statement-breakpoint
ALTER INDEX "coznt"."plan_artifacts_project_kind_slug_idx" RENAME TO "project_tasks_project_kind_slug_idx";--> statement-breakpoint
ALTER INDEX "coznt"."plan_artifacts_fts_idx" RENAME TO "project_tasks_fts_idx";--> statement-breakpoint
ALTER TABLE "coznt"."project_tasks" DROP COLUMN "effort_estimate";--> statement-breakpoint
ALTER TABLE "coznt"."project_tasks" DROP COLUMN "classifications";--> statement-breakpoint
ALTER TABLE "coznt"."project_tasks" DROP COLUMN "claimed_path";--> statement-breakpoint

ALTER TABLE "coznt"."plan_relationships" RENAME CONSTRAINT "plan_relationships_from_plan_artifact_id_plan_artifacts_id_fk" TO "plan_relationships_from_project_tasks_id_project_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "coznt"."plan_relationships" RENAME COLUMN "from_plan_artifact_id" TO "from_project_tasks_id";--> statement-breakpoint
ALTER TABLE "coznt"."plan_relationships" RENAME CONSTRAINT "plan_relationships_to_plan_artifact_id_plan_artifacts_id_fk" TO "plan_relationships_to_project_tasks_id_project_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "coznt"."plan_relationships" RENAME COLUMN "to_plan_artifact_id" TO "to_project_tasks_id";--> statement-breakpoint

ALTER TABLE "coznt"."plan_revisions" RENAME CONSTRAINT "plan_revisions_plan_artifact_id_plan_artifacts_id_fk" TO "plan_revisions_project_tasks_id_project_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "coznt"."plan_revisions" RENAME COLUMN "plan_artifact_id" TO "project_tasks_id";--> statement-breakpoint
ALTER INDEX "coznt"."plan_revisions_plan_artifact_idx" RENAME TO "plan_revisions_project_tasks_idx";--> statement-breakpoint
ALTER TABLE "coznt"."plan_revisions" RENAME CONSTRAINT "plan_revisions_plan_artifact_revision_unique" TO "plan_revisions_project_tasks_revision_unique";--> statement-breakpoint

ALTER TABLE "coznt"."comments" RENAME CONSTRAINT "comments_plan_artifact_id_plan_artifacts_id_fk" TO "comments_project_tasks_id_project_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "coznt"."comments" RENAME COLUMN "plan_artifact_id" TO "project_tasks_id";--> statement-breakpoint
ALTER INDEX "coznt"."comments_plan_artifact_idx" RENAME TO "comments_project_tasks_idx";--> statement-breakpoint

ALTER TABLE "coznt"."work_items" RENAME CONSTRAINT "work_items_plan_artifact_id_plan_artifacts_id_fk" TO "work_items_project_tasks_id_project_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "coznt"."work_items" RENAME COLUMN "plan_artifact_id" TO "project_tasks_id";--> statement-breakpoint
ALTER INDEX "coznt"."work_items_plan_artifact_idx" RENAME TO "work_items_project_tasks_idx";--> statement-breakpoint

ALTER TABLE "coznt"."governance_records" RENAME CONSTRAINT "governance_records_plan_artifact_id_plan_artifacts_id_fk" TO "governance_records_project_tasks_id_project_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "coznt"."governance_records" RENAME COLUMN "plan_artifact_id" TO "project_tasks_id";--> statement-breakpoint

ALTER TABLE "coznt"."evidence_links" RENAME CONSTRAINT "evidence_links_plan_artifact_id_plan_artifacts_id_fk" TO "evidence_links_project_tasks_id_project_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "coznt"."evidence_links" RENAME COLUMN "plan_artifact_id" TO "project_tasks_id";--> statement-breakpoint

ALTER TABLE "coznt"."deployments" RENAME CONSTRAINT "deployments_plan_artifact_id_plan_artifacts_id_fk" TO "deployments_project_tasks_id_project_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "coznt"."deployments" RENAME COLUMN "plan_artifact_id" TO "project_tasks_id";--> statement-breakpoint
ALTER INDEX "coznt"."deployments_plan_artifact_idx" RENAME TO "deployments_project_tasks_idx";--> statement-breakpoint

ALTER TABLE "coznt"."test_runs" RENAME CONSTRAINT "test_runs_plan_artifact_id_plan_artifacts_id_fk" TO "test_runs_project_tasks_id_project_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "coznt"."test_runs" RENAME COLUMN "plan_artifact_id" TO "project_tasks_id";--> statement-breakpoint
ALTER INDEX "coznt"."test_runs_plan_artifact_idx" RENAME TO "test_runs_project_tasks_idx";--> statement-breakpoint
