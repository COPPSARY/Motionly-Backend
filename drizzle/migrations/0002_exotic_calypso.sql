CREATE TYPE "public"."artifact_kind" AS ENUM('ASSET', 'SCREENSHOT', 'CONTACT_SHEET', 'BUILD_LOG', 'VALIDATION_REPORT', 'THUMBNAIL', 'VIDEO');--> statement-breakpoint
CREATE TYPE "public"."artifact_retention" AS ENUM('TEMPORARY', 'PROJECT');--> statement-breakpoint
CREATE TYPE "public"."asset_state" AS ENUM('PENDING', 'READY', 'FAILED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."generation_event_type" AS ENUM('STATUS_CHANGED', 'PROGRESS', 'ATTEMPT_STARTED', 'ATTEMPT_COMPLETED', 'ARTIFACT_CREATED', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."generation_intent" AS ENUM('CREATE', 'EDIT');--> statement-breakpoint
CREATE TYPE "public"."generation_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('QUEUED', 'PREPARING', 'GENERATING', 'VALIDATING', 'RENDERING', 'REVIEWING', 'REPAIRING', 'PUBLISHING', 'CANCELLING', 'COMPLETED', 'AWAITING_APPLY', 'CANCELLED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."model_provider" AS ENUM('gemini', 'openai', 'anthropic', 'openai-compatible');--> statement-breakpoint
CREATE TYPE "public"."queue_task_status" AS ENUM('QUEUED', 'LEASED', 'COMPLETED', 'DEAD');--> statement-breakpoint
CREATE TYPE "public"."queue_task_type" AS ENUM('GENERATION', 'RENDER', 'CLEANUP');--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"generation_id" uuid,
	"attempt_id" uuid,
	"kind" "artifact_kind" NOT NULL,
	"retention" "artifact_retention" NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" text NOT NULL,
	"object_key" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifacts_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "artifacts_byte_size_check" CHECK ("artifacts"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"state" "asset_state" DEFAULT 'PENDING' NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" text NOT NULL,
	"object_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "assets_byte_size_check" CHECK ("assets"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "generation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"provider_request_id" text,
	"finish_reason" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"validation_summary" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "generation_attempts_number_check" CHECK ("generation_attempts"."attempt_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "generation_events" (
	"generation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" "generation_event_type" NOT NULL,
	"status" "generation_status" NOT NULL,
	"stage" text NOT NULL,
	"progress" integer NOT NULL,
	"message" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_events_generation_id_sequence_pk" PRIMARY KEY("generation_id","sequence"),
	CONSTRAINT "generation_events_sequence_check" CHECK ("generation_events"."sequence" >= 1),
	CONSTRAINT "generation_events_progress_check" CHECK ("generation_events"."progress" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"intent" "generation_intent" NOT NULL,
	"status" "generation_status" DEFAULT 'QUEUED' NOT NULL,
	"stage" text DEFAULT 'QUEUED' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"base_version_id" uuid NOT NULL,
	"base_revision" integer NOT NULL,
	"output_version_id" uuid,
	"retried_from_id" uuid,
	"provider" "model_provider" NOT NULL,
	"model" text NOT NULL,
	"skill_bundle_version" text NOT NULL,
	"runtime_version" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"cancel_requested_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"error_details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_jobs_progress_check" CHECK ("generation_jobs"."progress" between 0 and 100),
	CONSTRAINT "generation_jobs_base_revision_check" CHECK ("generation_jobs"."base_revision" >= 1),
	CONSTRAINT "generation_jobs_attempts_check" CHECK ("generation_jobs"."attempt_count" >= 0 and "generation_jobs"."max_attempts" >= 1)
);
--> statement-breakpoint
CREATE TABLE "generation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"generation_id" uuid,
	"role" "generation_message_role" NOT NULL,
	"content" text NOT NULL,
	"asset_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_output_files" (
	"generation_output_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	CONSTRAINT "generation_output_files_generation_output_id_path_pk" PRIMARY KEY("generation_output_id","path"),
	CONSTRAINT "generation_output_files_path_check" CHECK ("generation_output_files"."path" in ('composition.html', 'styles.css', 'timeline.js', 'index.ts'))
);
--> statement-breakpoint
CREATE TABLE "generation_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"source_hash" text NOT NULL,
	"validation_report" jsonb NOT NULL,
	"published_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "generation_outputs_generation_id_unique" UNIQUE("generation_id")
);
--> statement-breakpoint
CREATE TABLE "generation_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_assets" (
	"project_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_assets_project_id_asset_id_pk" PRIMARY KEY("project_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "queue_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "queue_task_type" NOT NULL,
	"status" "queue_task_status" DEFAULT 'QUEUED' NOT NULL,
	"resource_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "queue_tasks_attempts_check" CHECK ("queue_tasks"."attempt_count" >= 0 and "queue_tasks"."max_attempts" >= 1)
);
--> statement-breakpoint
ALTER TABLE "project_versions" ADD COLUMN "parent_version_id" uuid;--> statement-breakpoint
ALTER TABLE "project_versions" ADD COLUMN "runtime_version" text;--> statement-breakpoint
ALTER TABLE "project_versions" ADD COLUMN "skill_bundle_version" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_generation_id_generation_jobs_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_attempt_id_generation_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."generation_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_generation_id_generation_jobs_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_events" ADD CONSTRAINT "generation_events_generation_id_generation_jobs_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_thread_id_generation_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."generation_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_base_version_id_project_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."project_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_output_version_id_project_versions_id_fk" FOREIGN KEY ("output_version_id") REFERENCES "public"."project_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_retried_from_id_generation_jobs_id_fk" FOREIGN KEY ("retried_from_id") REFERENCES "public"."generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_messages" ADD CONSTRAINT "generation_messages_thread_id_generation_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."generation_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_messages" ADD CONSTRAINT "generation_messages_generation_id_generation_jobs_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_output_files" ADD CONSTRAINT "generation_output_files_generation_output_id_generation_outputs_id_fk" FOREIGN KEY ("generation_output_id") REFERENCES "public"."generation_outputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_outputs" ADD CONSTRAINT "generation_outputs_generation_id_generation_jobs_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_outputs" ADD CONSTRAINT "generation_outputs_published_version_id_project_versions_id_fk" FOREIGN KEY ("published_version_id") REFERENCES "public"."project_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_threads" ADD CONSTRAINT "generation_threads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_threads" ADD CONSTRAINT "generation_threads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_generation_created_idx" ON "artifacts" USING btree ("generation_id","created_at");--> statement-breakpoint
CREATE INDEX "artifacts_expiry_idx" ON "artifacts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "assets_workspace_created_idx" ON "assets" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_attempts_job_number_unique" ON "generation_attempts" USING btree ("generation_id","attempt_number");--> statement-breakpoint
CREATE INDEX "generation_events_job_created_idx" ON "generation_events" USING btree ("generation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_jobs_creator_idempotency_unique" ON "generation_jobs" USING btree ("created_by","idempotency_key");--> statement-breakpoint
CREATE INDEX "generation_jobs_project_created_idx" ON "generation_jobs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_jobs_status_updated_idx" ON "generation_jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "generation_messages_thread_created_idx" ON "generation_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_threads_project_updated_idx" ON "generation_threads" USING btree ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "queue_tasks_claim_idx" ON "queue_tasks" USING btree ("status","available_at","priority");--> statement-breakpoint
CREATE INDEX "queue_tasks_lease_expiry_idx" ON "queue_tasks" USING btree ("lease_expires_at");--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_parent_version_id_project_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."project_versions"("id") ON DELETE set null ON UPDATE no action;